import type { PropsWithChildren, ReactElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });

export const createQueryClientWrapper = (
  queryClient: QueryClient,
): ((props: PropsWithChildren) => ReactElement) =>
  function QueryClientWrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

export interface RenderWithQueryClientResult extends RenderResult {
  queryClient: QueryClient;
  user: ReturnType<typeof userEvent.setup>;
}

export const renderWithQueryClient = (
  ui: ReactElement,
  queryClient = createTestQueryClient(),
): RenderWithQueryClientResult => {
  const rendered = render(ui, {
    wrapper: createQueryClientWrapper(queryClient),
  });

  return {
    ...rendered,
    queryClient,
    user: userEvent.setup(),
  };
};
