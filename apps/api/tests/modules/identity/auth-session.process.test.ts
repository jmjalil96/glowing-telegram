import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { authConstants } from "../../../src/modules/identity/domain/identity-constants.js";
import {
  createAuthFixtureUser,
  createSessionFixture,
  runMigrationsForConnectionString,
  startTestDatabase,
  updateUserActiveState,
  type AuthFixtureUserRecord,
  type TestDatabase,
} from "../../helpers/database.js";
import { waitForHttpReady, waitForHttpResponse } from "../../helpers/http.js";
import { getFreePort } from "../../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  type StartedServerProcess,
} from "../../helpers/process.js";

const PROCESS_ENV = {
  LOG_LEVEL: "silent",
} as const;

const jsonContentType = "application/json";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

interface LoginSuccessBody {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
  };
}

interface MeSuccessBody {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
  };
}

interface LogoutSuccessBody {
  success: boolean;
}

describe("authentication and session contract", () => {
  let testDatabase: TestDatabase | undefined;
  let fixtureUser: AuthFixtureUserRecord | undefined;
  let serverProcess: StartedServerProcess | undefined;
  let port = 0;

  const getBaseUrl = (): string => `http://127.0.0.1:${port}`;

  const fetchJson = async <TBody>(
    path: string,
    init?: RequestInit,
  ): Promise<{
    response: Response;
    body: TBody;
    requestId: string;
  }> => {
    const response = await fetch(`${getBaseUrl()}${path}`, init);
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toBeTruthy();
    expect(
      response.headers.get("content-type")?.startsWith(jsonContentType),
    ).toBe(true);

    return {
      response,
      body: (await response.json()) as TBody,
      requestId: requestId ?? "",
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

  const cookieHeaderFromToken = (token: string): string =>
    `${authConstants.sessionCookieName}=${token}`;

  const login = async ({
    password = fixtureUser?.password ?? "",
    cookie,
  }: {
    password?: string;
    cookie?: string;
  } = {}): Promise<{
    response: Response;
    body: LoginSuccessBody | ErrorEnvelope;
    sessionCookie: string | null;
    setCookie: string | null;
  }> => {
    const { response, body } = await fetchJson<
      LoginSuccessBody | ErrorEnvelope
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
        email: fixtureUser?.email ?? "",
        password,
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
  ): Promise<{
    response: Response;
    body: MeSuccessBody | ErrorEnvelope;
  }> =>
    fetchJson<MeSuccessBody | ErrorEnvelope>(
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
  ): Promise<{
    response: Response;
    body: LogoutSuccessBody | ErrorEnvelope;
    setCookie: string | null;
  }> => {
    const { response, body } = await fetchJson<
      LogoutSuccessBody | ErrorEnvelope
    >("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie,
      },
    });

    return {
      response,
      body,
      setCookie: response.headers.get("set-cookie"),
    };
  };

  const expectUnauthorized = async (cookie?: string): Promise<void> => {
    const { response, body } = await getMe(cookie);

    expect(response.status).toBe(401);
    expect("error" in body).toBe(true);

    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  };

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);
    fixtureUser = await createAuthFixtureUser(testDatabase.connectionString);

    port = await getFreePort();
    serverProcess = startServerProcess({
      databaseUrl: testDatabase.connectionString,
      port,
      extraEnv: {
        ...PROCESS_ENV,
      },
    });

    await waitForHttpReady(`${getBaseUrl()}/health`);
    await waitForHttpResponse(
      `${getBaseUrl()}/ready`,
      (response) => response.status === 200,
    );
  });

  afterEach(async () => {
    if (testDatabase && fixtureUser) {
      await updateUserActiveState({
        connectionString: testDatabase.connectionString,
        userId: fixtureUser.userId,
        isActive: true,
      });
    }
  });

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("POST /api/v1/auth/login establishes a usable session", async () => {
    const loginResult = await login();

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.sessionCookie).not.toBeNull();
    expect(loginResult.setCookie).toContain(
      `${authConstants.sessionCookieName}=`,
    );
    expect(loginResult.setCookie).toContain("HttpOnly");
    expect(loginResult.setCookie).toContain("Path=/");
    expect(loginResult.setCookie).toContain("SameSite=Lax");

    const meResult = await getMe(loginResult.sessionCookie ?? undefined);

    expect(meResult.response.status).toBe(200);
  });

  it("GET /api/v1/auth/me rejects anonymous access", async () => {
    await expectUnauthorized();
  });

  it("GET /api/v1/auth/me resolves the current user from the session", async () => {
    const loginResult = await login();
    const meResult = await getMe(loginResult.sessionCookie ?? undefined);

    expect(meResult.response.status).toBe(200);
    expect("user" in meResult.body).toBe(true);

    if ("user" in meResult.body && fixtureUser) {
      expect(fixtureUser.emailVerifiedAt).not.toBeNull();

      if (!fixtureUser.emailVerifiedAt) {
        throw new Error("Expected fixture user email to be verified");
      }

      expect(meResult.body.user).toEqual({
        userId: fixtureUser.userId,
        tenantId: fixtureUser.tenantId,
        email: fixtureUser.email,
        displayName: fixtureUser.displayName,
        emailVerifiedAt: fixtureUser.emailVerifiedAt.toISOString(),
      });
    }
  });

  it("POST /api/v1/auth/logout clears the cookie and revokes the current session", async () => {
    const loginResult = await login();
    const sessionCookie = loginResult.sessionCookie;

    expect(sessionCookie).not.toBeNull();

    if (!sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const logoutResult = await logout(sessionCookie);

    expect(logoutResult.response.status).toBe(200);
    expect(logoutResult.body).toEqual({
      success: true,
    });
    expect(logoutResult.setCookie).toContain(
      `${authConstants.sessionCookieName}=`,
    );
    expect(logoutResult.setCookie).toContain("Path=/");

    await expectUnauthorized(sessionCookie);
  });

  it("random session cookies behave as anonymous", async () => {
    await expectUnauthorized(
      cookieHeaderFromToken("definitely-invalid-session"),
    );
  });

  it("expired sessions are not accepted", async () => {
    if (!testDatabase || !fixtureUser) {
      throw new Error("Expected auth fixture to be initialized");
    }

    const expiredSession = await createSessionFixture({
      connectionString: testDatabase.connectionString,
      userId: fixtureUser.userId,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expectUnauthorized(cookieHeaderFromToken(expiredSession.rawToken));
  });

  it("re-login rotates the current session and invalidates the prior cookie", async () => {
    const firstLogin = await login();
    const firstSessionCookie = firstLogin.sessionCookie;

    expect(firstSessionCookie).not.toBeNull();

    if (!firstSessionCookie) {
      throw new Error("Expected first login to issue a session cookie");
    }

    const secondLogin = await login({
      cookie: firstSessionCookie,
    });
    const secondSessionCookie = secondLogin.sessionCookie;

    expect(secondLogin.response.status).toBe(200);
    expect(secondSessionCookie).not.toBeNull();
    expect(secondSessionCookie).not.toBe(firstSessionCookie);

    await expectUnauthorized(firstSessionCookie);

    const meResult = await getMe(secondSessionCookie ?? undefined);

    expect(meResult.response.status).toBe(200);
  });

  it("deactivated users lose session access immediately", async () => {
    if (!testDatabase || !fixtureUser) {
      throw new Error("Expected auth fixture to be initialized");
    }

    const loginResult = await login();
    const sessionCookie = loginResult.sessionCookie;

    expect(sessionCookie).not.toBeNull();

    if (!sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    await updateUserActiveState({
      connectionString: testDatabase.connectionString,
      userId: fixtureUser.userId,
      isActive: false,
    });

    await expectUnauthorized(sessionCookie);
  });

  it("failed login does not establish a session", async () => {
    const loginResult = await login({
      password: "definitely-wrong-password",
    });

    expect(loginResult.response.status).toBe(401);
    expect("error" in loginResult.body).toBe(true);

    if ("error" in loginResult.body) {
      expect(loginResult.body.error.code).toBe("INVALID_PASSWORD");
    }

    if (loginResult.sessionCookie) {
      await expectUnauthorized(loginResult.sessionCookie);
      return;
    }

    expect(loginResult.setCookie).toBeNull();
  });
});
