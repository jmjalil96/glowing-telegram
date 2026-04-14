import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { authHandlers } from "../helpers/api-contract";
import { renderAppRoute } from "../helpers/router";
import { server } from "../setup/msw";

describe("forgot-password route", () => {
  it("shows the anti-enumeration success state and allows another attempt", async () => {
    server.use(
      authHandlers.forgotPasswordSuccess({
        delayMs: 100,
      }),
    );

    const { user } = await renderAppRoute({
      initialEntry: "/forgot-password",
    });

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByRole("button", { name: "Sending reset link..." }),
    ).toBeDisabled();
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "If the account exists, a reset link is on its way.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Send another email" }),
    );

    expect(await screen.findByText("Reset your password")).toBeInTheDocument();
  });
});
