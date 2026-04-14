import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { authHandlers } from "../helpers/api-contract";
import { renderAppRoute } from "../helpers/router";
import { server } from "../setup/msw";

describe("reset-password route", () => {
  it("shows the missing-token state when no token is present", async () => {
    await renderAppRoute({
      initialEntry: "/reset-password",
    });

    expect(
      await screen.findByText("Reset link unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invalid reset link")).toBeInTheDocument();
  });

  it("transitions to the invalid-token state when the server rejects the token", async () => {
    server.use(
      authHandlers.resetPasswordError({
        error: {
          code: "INVALID_RESET_TOKEN",
          message: "This reset token is invalid.",
          status: 400,
        },
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/reset-password?token=stale-token",
    });

    await user.type(screen.getByLabelText("New password"), "Techbros456!");
    await user.type(screen.getByLabelText("Confirm password"), "Techbros456!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Reset link expired")).toBeInTheDocument();
    expect(screen.getByText("Link is invalid or expired")).toBeInTheDocument();
  });

  it("shows the generic form error when the server fails unexpectedly", async () => {
    server.use(
      authHandlers.resetPasswordError({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected failure.",
          status: 500,
        },
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/reset-password?token=fresh-token",
    });

    await user.type(screen.getByLabelText("New password"), "Techbros456!");
    await user.type(screen.getByLabelText("Confirm password"), "Techbros456!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText("Password reset failed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We could not complete your request right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeInTheDocument();
  });

  it("shows pending UI, success feedback, and returns the user to login", async () => {
    server.use(
      authHandlers.resetPasswordSuccess({
        delayMs: 100,
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/reset-password?token=fresh-token",
    });

    await user.type(screen.getByLabelText("New password"), "Techbros456!");
    await user.type(screen.getByLabelText("Confirm password"), "Techbros456!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByRole("button", { name: "Updating password..." }),
    ).toBeDisabled();
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(await screen.findByText("Sign in to Techbros")).toBeInTheDocument();
  });
});
