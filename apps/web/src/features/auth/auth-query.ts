import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { isApiError } from "@/lib/api";

import {
  forgotPassword,
  login,
  logout,
  me,
  resetPassword,
  type AuthenticatedUser,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
} from "./auth-client";

export const authMeQueryKey = ["auth", "me"] as const;
export const privateQueryKey = ["private"] as const;

export const authMeQueryOptions = () =>
  queryOptions({
    queryFn: async ({ signal }): Promise<AuthenticatedUser | null> => {
      try {
        const response = await me({ signal });
        return response.user;
      } catch (error) {
        if (
          isApiError(error) &&
          error.status === 401 &&
          error.code === "UNAUTHORIZED"
        ) {
          return null;
        }

        throw error;
      }
    },
    queryKey: authMeQueryKey,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60_000,
  });

export const useAuthMeQuery = () => useQuery(authMeQueryOptions());

export const setAuthenticatedUser = async (
  queryClient: QueryClient,
  user: AuthenticatedUser,
): Promise<void> => {
  await queryClient.cancelQueries({
    exact: true,
    queryKey: authMeQueryKey,
  });
  queryClient.setQueryData(authMeQueryKey, user);
};

export const clearAuthState = async (
  queryClient: QueryClient,
): Promise<void> => {
  await queryClient.cancelQueries({
    exact: true,
    queryKey: authMeQueryKey,
  });
  await queryClient.cancelQueries({
    queryKey: privateQueryKey,
  });

  queryClient.removeQueries({
    queryKey: privateQueryKey,
  });
  queryClient.setQueryData(authMeQueryKey, null);
};

export const useLoginMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: async ({ user }) => {
      await setAuthenticatedUser(queryClient, user);
    },
  });
};

export const useLogoutMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      await clearAuthState(queryClient);
    },
  });
};

export const useForgotPasswordMutation = () =>
  useMutation({
    mutationFn: (input: ForgotPasswordInput) => forgotPassword(input),
  });

export const useResetPasswordMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ResetPasswordInput) => resetPassword(input),
    onSuccess: async () => {
      await clearAuthState(queryClient);
    },
  });
};
