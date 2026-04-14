import { act } from "react";

import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";

import type { AuthenticatedUser } from "@/features/auth/auth-client";
import { authMeQueryKey } from "@/features/auth/auth-query";
import { routeTree } from "@/routeTree.gen";

import {
  type RenderWithQueryClientResult,
  createTestQueryClient,
  renderWithQueryClient,
} from "./query-client";

interface RenderAppRouteOptions {
  authenticatedUser?: AuthenticatedUser | null;
  initialEntry?: string;
}

const createAppTestRouter = (
  history: ReturnType<typeof createMemoryHistory>,
  queryClient: ReturnType<typeof createTestQueryClient>,
) =>
  createRouter({
    context: {
      queryClient,
    },
    defaultPendingMinMs: 0,
    defaultPendingMs: 0,
    history,
    routeTree,
  });

export interface RenderAppRouteResult extends RenderWithQueryClientResult {
  history: ReturnType<typeof createMemoryHistory>;
  router: ReturnType<typeof createAppTestRouter>;
}

export const renderAppRoute = async ({
  authenticatedUser,
  initialEntry = "/",
}: RenderAppRouteOptions = {}): Promise<RenderAppRouteResult> => {
  const queryClient = createTestQueryClient();

  if (authenticatedUser !== undefined) {
    queryClient.setQueryData(authMeQueryKey, authenticatedUser);
  }

  const history = createMemoryHistory({
    initialEntries: [initialEntry],
  });
  const router = createAppTestRouter(history, queryClient);
  const rendered = renderWithQueryClient(
    <RouterProvider router={router} />,
    queryClient,
  );

  await act(async () => {
    await router.load();
  });

  return {
    ...rendered,
    history,
    router,
  };
};
