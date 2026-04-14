import type { ReactNode } from "react";
import type * as TanStackRouter from "@tanstack/react-router";

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RouteErrorState } from "@/components/feedback/route-error-state";
import { ApiError } from "@/lib/api";

import { renderWithQueryClient } from "../helpers/query-client";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanStackRouter>(
    "@tanstack/react-router",
  );

  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

describe("RouteErrorState", () => {
  it("renders API error messages and retries the route load", async () => {
    const reset = vi.fn();
    const { user } = renderWithQueryClient(
      <RouteErrorState
        error={
          new ApiError({
            code: "INTERNAL_ERROR",
            details: [],
            message: "Route data exploded.",
            requestId: "request-id-1",
            status: 500,
          })
        }
        info={{
          componentStack: "",
        }}
        reset={reset}
      />,
    );

    expect(screen.getByText("Route data exploded.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
