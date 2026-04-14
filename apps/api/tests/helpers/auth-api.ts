import { authConstants } from "../../src/auth/constants.js";

const jsonContentType = "application/json";

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

export interface AuthenticatedUserBody {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
  };
}

export interface SuccessBody {
  success: boolean;
}

export interface JsonResponse<TBody> {
  response: Response;
  body: TBody;
  requestId: string;
}

export interface LoginResult {
  response: Response;
  body: AuthenticatedUserBody | ErrorEnvelope;
  sessionCookie: string | null;
  setCookie: string | null;
}

export interface AuthApiClient {
  fetchJson: <TBody>(
    path: string,
    init?: RequestInit,
  ) => Promise<JsonResponse<TBody>>;
  login: (
    user: {
      email: string;
      password: string;
    },
    cookie?: string,
  ) => Promise<LoginResult>;
  getMe: (
    cookie?: string,
  ) => Promise<JsonResponse<AuthenticatedUserBody | ErrorEnvelope>>;
  logout: (
    cookie: string,
  ) => Promise<
    JsonResponse<SuccessBody | ErrorEnvelope> & { setCookie: string | null }
  >;
  forgotPassword: (
    email: string,
  ) => Promise<JsonResponse<SuccessBody | ErrorEnvelope>>;
  resetPassword: (params: {
    token: string;
    password: string;
    cookie?: string;
  }) => Promise<
    JsonResponse<SuccessBody | ErrorEnvelope> & { setCookie: string | null }
  >;
  extractSessionCookie: (setCookie: string | null) => string | null;
  cookieHeaderFromToken: (token: string) => string;
}

export const createAuthApiClient = (baseUrl: string): AuthApiClient => {
  const fetchJson = async <TBody>(
    path: string,
    init?: RequestInit,
  ): Promise<JsonResponse<TBody>> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const requestId = response.headers.get("x-request-id");

    if (!requestId) {
      throw new Error(`Expected x-request-id header for ${path}`);
    }

    if (!response.headers.get("content-type")?.startsWith(jsonContentType)) {
      throw new Error(`Expected JSON content-type for ${path}`);
    }

    return {
      response,
      body: (await response.json()) as TBody,
      requestId,
    };
  };

  const extractSessionCookie = (setCookie: string | null): string | null => {
    if (!setCookie) {
      return null;
    }

    const cookie = setCookie.split(";")[0]?.trim() ?? null;

    if (!cookie?.startsWith(`${authConstants.sessionCookieName}=`)) {
      return null;
    }

    return cookie;
  };

  const login = async (
    user: {
      email: string;
      password: string;
    },
    cookie?: string,
  ): Promise<LoginResult> => {
    const { response, body } = await fetchJson<
      AuthenticatedUserBody | ErrorEnvelope
    >("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie
          ? {
              cookie,
            }
          : {}),
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });
    const setCookie = response.headers.get("set-cookie");

    return {
      response,
      body,
      sessionCookie: extractSessionCookie(setCookie),
      setCookie,
    };
  };

  const getMe = async (
    cookie?: string,
  ): Promise<JsonResponse<AuthenticatedUserBody | ErrorEnvelope>> =>
    fetchJson<AuthenticatedUserBody | ErrorEnvelope>(
      "/api/v1/auth/me",
      cookie
        ? {
            headers: {
              cookie,
            },
          }
        : undefined,
    );

  const logout = async (
    cookie: string,
  ): Promise<
    JsonResponse<SuccessBody | ErrorEnvelope> & {
      setCookie: string | null;
    }
  > => {
    const result = await fetchJson<SuccessBody | ErrorEnvelope>(
      "/api/v1/auth/logout",
      {
        method: "POST",
        headers: {
          cookie,
        },
      },
    );

    return {
      ...result,
      setCookie: result.response.headers.get("set-cookie"),
    };
  };

  const forgotPassword = async (
    email: string,
  ): Promise<JsonResponse<SuccessBody | ErrorEnvelope>> =>
    fetchJson<SuccessBody | ErrorEnvelope>("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

  const resetPassword = async ({
    token,
    password,
    cookie,
  }: {
    token: string;
    password: string;
    cookie?: string;
  }): Promise<
    JsonResponse<SuccessBody | ErrorEnvelope> & {
      setCookie: string | null;
    }
  > => {
    const result = await fetchJson<SuccessBody | ErrorEnvelope>(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie
            ? {
                cookie,
              }
            : {}),
        },
        body: JSON.stringify({
          token,
          password,
        }),
      },
    );

    return {
      ...result,
      setCookie: result.response.headers.get("set-cookie"),
    };
  };

  return {
    fetchJson,
    login,
    getMe,
    logout,
    forgotPassword,
    resetPassword,
    extractSessionCookie,
    cookieHeaderFromToken: (token) =>
      `${authConstants.sessionCookieName}=${token}`,
  };
};
