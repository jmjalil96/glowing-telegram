import { act, renderHook } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import {
  authHandlers,
  createApiErrorResponse,
} from "../../helpers/api-contract";
import { defaultAuthenticatedUser } from "../../helpers/auth-fixtures";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../../helpers/query-client";
import { server } from "../../setup/msw";
import {
  authMeQueryKey,
  authMeQueryOptions,
  clearAuthState,
  privateQueryKey,
  setAuthenticatedUser,
  useLoginMutation,
  useLogoutMutation,
  useResetPasswordMutation,
} from "@/features/auth/auth-query";

describe("auth-query", () => {
  it("treats 401 UNAUTHORIZED as anonymous auth state", async () => {
    const queryClient = createTestQueryClient();

    server.use(authHandlers.meUnauthorized());

    await expect(
      queryClient.fetchQuery(authMeQueryOptions()),
    ).resolves.toBeNull();
  });

  it("seeds and clears auth cache state deterministically", async () => {
    const queryClient = createTestQueryClient();

    await setAuthenticatedUser(queryClient, defaultAuthenticatedUser);
    queryClient.setQueryData([...privateQueryKey, "dashboard"], {
      widgets: [1, 2, 3],
    });

    expect(queryClient.getQueryData(authMeQueryKey)).toEqual(
      defaultAuthenticatedUser,
    );

    await clearAuthState(queryClient);

    expect(queryClient.getQueryData(authMeQueryKey)).toBeNull();
    expect(
      queryClient.getQueriesData({
        queryKey: privateQueryKey,
      }),
    ).toEqual([]);
  });

  it("stores the authenticated user after a successful login mutation", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useLoginMutation(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    server.use(authHandlers.loginSuccess());

    await act(async () => {
      await result.current.mutateAsync({
        email: defaultAuthenticatedUser.email,
        password: "Techbros123!",
      });
    });

    expect(queryClient.getQueryData(authMeQueryKey)).toEqual(
      defaultAuthenticatedUser,
    );
  });

  it("clears auth and private cache state after logout", async () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData(authMeQueryKey, defaultAuthenticatedUser);
    queryClient.setQueryData([...privateQueryKey, "dashboard"], {
      widgets: [1, 2, 3],
    });

    const { result } = renderHook(() => useLogoutMutation(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    server.use(authHandlers.logoutSuccess());

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryData(authMeQueryKey)).toBeNull();
    expect(
      queryClient.getQueriesData({
        queryKey: privateQueryKey,
      }),
    ).toEqual([]);
  });

  it("preserves auth and private cache state when logout fails", async () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData(authMeQueryKey, defaultAuthenticatedUser);
    queryClient.setQueryData([...privateQueryKey, "dashboard"], {
      widgets: [1, 2, 3],
    });

    const { result } = renderHook(() => useLogoutMutation(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    server.use(
      authHandlers.logoutError({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected failure.",
          status: 500,
        },
      }),
    );

    await expect(
      act(async () => {
        await result.current.mutateAsync();
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });

    expect(queryClient.getQueryData(authMeQueryKey)).toEqual(
      defaultAuthenticatedUser,
    );
    expect(queryClient.getQueryData([...privateQueryKey, "dashboard"])).toEqual(
      {
        widgets: [1, 2, 3],
      },
    );
  });

  it("clears auth and private cache state after password reset", async () => {
    const queryClient = createTestQueryClient();

    queryClient.setQueryData(authMeQueryKey, defaultAuthenticatedUser);
    queryClient.setQueryData([...privateQueryKey, "dashboard"], {
      widgets: [1, 2, 3],
    });

    const { result } = renderHook(() => useResetPasswordMutation(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    server.use(authHandlers.resetPasswordSuccess());

    await act(async () => {
      await result.current.mutateAsync({
        password: "Techbros456!",
        token: "reset-token",
      });
    });

    expect(queryClient.getQueryData(authMeQueryKey)).toBeNull();
    expect(
      queryClient.getQueriesData({
        queryKey: privateQueryKey,
      }),
    ).toEqual([]);
  });

  it("surfaces unexpected auth/me failures instead of masking them", async () => {
    const queryClient = createTestQueryClient();

    server.use(
      http.get("/api/v1/auth/me", () =>
        createApiErrorResponse({
          code: "INTERNAL_ERROR",
          message: "Unexpected failure.",
          status: 500,
        }),
      ),
    );

    await expect(
      queryClient.fetchQuery(authMeQueryOptions()),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });
});
