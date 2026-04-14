import { queryClient } from "./lib/query-client";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  context: {
    queryClient,
  },
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
