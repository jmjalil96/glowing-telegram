import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { authMeQueryOptions } from "@/features/auth/auth-query";

export const Route = createFileRoute("/_guest")({
  beforeLoad: async ({ context }) => {
    const authenticatedUser =
      await context.queryClient.fetchQuery(authMeQueryOptions());

    if (authenticatedUser !== null) {
      // TanStack Router redirects are thrown intentionally from loaders/guards.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        replace: true,
        to: "/dashboard",
      });
    }
  },
  component: Outlet,
});
