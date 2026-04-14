import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { authHandlers, createValidationDetail } from "../helpers/api-contract";
import { defaultAuthenticatedUser } from "../helpers/auth-fixtures";
import { renderAppRoute } from "../helpers/router";
import { server } from "../setup/msw";

describe("login route", () => {
  it("shows local validation errors before hitting the network", async () => {
    const { user } = await renderAppRoute({
      initialEntry: "/login",
    });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
  });

  it("maps server validation errors onto the form fields", async () => {
    server.use(
      authHandlers.loginError({
        error: {
          code: "VALIDATION_ERROR",
          details: [
            createValidationDetail({
              message: "Server says the email is invalid.",
              path: "email",
            }),
            createValidationDetail({
              message: "Server says the password is invalid.",
              path: "password",
            }),
          ],
          message: "Validation failed.",
          status: 400,
        },
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/login",
    });

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "Techbros123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Server says the email is invalid."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Server says the password is invalid."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sign-in failed")).not.toBeInTheDocument();
  });

  it("shows business failures as a form-level banner", async () => {
    server.use(
      authHandlers.loginError({
        error: {
          code: "ACCOUNT_INACTIVE",
          message: "Your account is inactive.",
          status: 403,
        },
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/login",
    });

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "Techbros123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByText("Your account is inactive.")).toBeInTheDocument();
  });

  it("shows pending UI, success feedback, and redirects to the requested route", async () => {
    server.use(
      authHandlers.loginSuccess({
        delayMs: 100,
        user: defaultAuthenticatedUser,
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/login?redirect=/dashboard",
    });

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "Techbros123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("button", { name: "Signing in..." }),
    ).toBeDisabled();
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
    expect(await screen.findByText("Workspace dashboard")).toBeInTheDocument();
  });
});
