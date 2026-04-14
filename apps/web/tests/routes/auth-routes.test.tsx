import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { authHandlers } from "../helpers/api-contract";
import { defaultAuthenticatedUser } from "../helpers/auth-fixtures";
import { renderAppRoute } from "../helpers/router";
import { server } from "../setup/msw";

describe("auth route guards", () => {
  it("redirects anonymous users from protected routes to login with a safe redirect", async () => {
    const { router } = await renderAppRoute({
      initialEntry: "/dashboard",
    });

    expect(await screen.findByText("Sign in to Techbros")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({
      redirect: "/dashboard",
    });
  });

  it("redirects authenticated users away from guest routes", async () => {
    server.use(authHandlers.meSuccess(defaultAuthenticatedUser));

    const { router } = await renderAppRoute({
      initialEntry: "/login",
    });

    expect(await screen.findByText("Workspace dashboard")).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dashboard");
    });
  });

  it("keeps authenticated users on the dashboard when logout fails", async () => {
    server.use(
      authHandlers.logoutError({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected failure.",
          status: 500,
        },
      }),
    );

    const { router, user } = await renderAppRoute({
      authenticatedUser: defaultAuthenticatedUser,
      initialEntry: "/dashboard",
    });

    await user.click(screen.getByRole("button", { name: /playwright user/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Logout" }));

    expect(
      await screen.findByText(
        "We could not sign you out right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dashboard");
    expect(screen.getByText("Workspace dashboard")).toBeInTheDocument();
  });
});
