import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authConstants } from "../../../src/modules/identity/domain/identity-constants.js";
import {
  createAuthFixtureUser,
  createPasswordResetTokenFixture,
  runMigrationsForConnectionString,
  startTestDatabase,
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

interface AuthenticatedUserBody {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
  };
}

interface SuccessBody {
  success: boolean;
}

describe("authorization and isolation contract", () => {
  let testDatabase: TestDatabase | undefined;
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

  const login = async (
    user: Pick<AuthFixtureUserRecord, "email" | "password">,
    cookie?: string,
  ): Promise<{
    response: Response;
    body: AuthenticatedUserBody | ErrorEnvelope;
    sessionCookie: string | null;
    setCookie: string | null;
  }> => {
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
  ): Promise<{
    response: Response;
    body: AuthenticatedUserBody | ErrorEnvelope;
  }> =>
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
  ): Promise<{
    response: Response;
    body: SuccessBody | ErrorEnvelope;
  }> =>
    fetchJson<SuccessBody | ErrorEnvelope>("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie,
      },
    });

  const resetPassword = async ({
    token,
    password,
  }: {
    token: string;
    password: string;
  }): Promise<{
    response: Response;
    body: SuccessBody | ErrorEnvelope;
  }> =>
    fetchJson<SuccessBody | ErrorEnvelope>("/api/v1/auth/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token,
        password,
      }),
    });

  const expectUnauthorized = async (cookie?: string): Promise<void> => {
    const { response, body } = await getMe(cookie);

    expect(response.status).toBe(401);
    expect("error" in body).toBe(true);

    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  };

  const expectCurrentUser = async (
    cookie: string,
    user: AuthFixtureUserRecord,
  ): Promise<void> => {
    const { response, body } = await getMe(cookie);

    expect(response.status).toBe(200);
    expect("user" in body).toBe(true);

    if (!("user" in body)) {
      throw new Error("Expected authenticated user response");
    }

    expect(body.user).toEqual({
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    });
  };

  const expectNoUsableSession = async ({
    sessionCookie,
    setCookie,
  }: {
    sessionCookie: string | null;
    setCookie: string | null;
  }): Promise<void> => {
    if (sessionCookie) {
      await expectUnauthorized(sessionCookie);
      return;
    }

    expect(setCookie).toBeNull();
  };

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);

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

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("inactive account login is forbidden", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const inactiveUser = await createAuthFixtureUser(
      testDatabase.connectionString,
      {
        isActive: false,
      },
    );
    const loginResult = await login(inactiveUser);

    expect(loginResult.response.status).toBe(403);
    expect("error" in loginResult.body).toBe(true);

    if ("error" in loginResult.body) {
      expect(loginResult.body.error.code).toBe("ACCOUNT_INACTIVE");
    }

    await expectNoUsableSession(loginResult);
  });

  it("unverified account login is forbidden", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const unverifiedUser = await createAuthFixtureUser(
      testDatabase.connectionString,
      {
        emailVerifiedAt: null,
      },
    );
    const loginResult = await login(unverifiedUser);

    expect(loginResult.response.status).toBe(403);
    expect("error" in loginResult.body).toBe(true);

    if ("error" in loginResult.body) {
      expect(loginResult.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    }

    await expectNoUsableSession(loginResult);
  });

  it("logout revokes only the current session", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const user = await createAuthFixtureUser(testDatabase.connectionString);
    const firstLogin = await login(user);
    const secondLogin = await login(user);

    expect(firstLogin.response.status).toBe(200);
    expect(secondLogin.response.status).toBe(200);
    expect(firstLogin.sessionCookie).not.toBeNull();
    expect(secondLogin.sessionCookie).not.toBeNull();

    const firstSessionCookie = firstLogin.sessionCookie;
    const secondSessionCookie = secondLogin.sessionCookie;

    if (!firstSessionCookie || !secondSessionCookie) {
      throw new Error("Expected both logins to issue session cookies");
    }

    const logoutResult = await logout(firstSessionCookie);

    expect(logoutResult.response.status).toBe(200);
    expect(logoutResult.body).toEqual({
      success: true,
    });

    await expectUnauthorized(firstSessionCookie);
    await expectCurrentUser(secondSessionCookie, user);
  });

  it("password reset revokes all sessions for the target user and only that user", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const userA = await createAuthFixtureUser(testDatabase.connectionString, {
      tenantSlug: "authorization-tenant-a",
      tenantName: "Authorization Tenant A",
    });
    const userB = await createAuthFixtureUser(testDatabase.connectionString, {
      tenantSlug: "authorization-tenant-b",
      tenantName: "Authorization Tenant B",
    });

    const firstLoginA = await login(userA);
    const secondLoginA = await login(userA);
    const loginB = await login(userB);

    const sessionCookieA1 = firstLoginA.sessionCookie;
    const sessionCookieA2 = secondLoginA.sessionCookie;
    const sessionCookieB = loginB.sessionCookie;

    expect(sessionCookieA1).not.toBeNull();
    expect(sessionCookieA2).not.toBeNull();
    expect(sessionCookieB).not.toBeNull();

    if (!sessionCookieA1 || !sessionCookieA2 || !sessionCookieB) {
      throw new Error("Expected logins to issue session cookies");
    }

    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: userA.userId,
    });
    const resetResult = await resetPassword({
      token: resetToken.rawToken,
      password: "Techbros456!",
    });

    expect(resetResult.response.status).toBe(200);
    expect(resetResult.body).toEqual({
      success: true,
    });

    await expectUnauthorized(sessionCookieA1);
    await expectUnauthorized(sessionCookieA2);
    await expectCurrentUser(sessionCookieB, userB);
  });

  it("session identity stays bound to its own user and tenant", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const tenantAUser = await createAuthFixtureUser(
      testDatabase.connectionString,
      {
        tenantSlug: "identity-tenant-a",
        tenantName: "Identity Tenant A",
      },
    );
    const tenantBUser = await createAuthFixtureUser(
      testDatabase.connectionString,
      {
        tenantSlug: "identity-tenant-b",
        tenantName: "Identity Tenant B",
      },
    );

    expect(tenantAUser.userId).not.toBe(tenantBUser.userId);
    expect(tenantAUser.tenantId).not.toBe(tenantBUser.tenantId);

    const tenantALogin = await login(tenantAUser);
    const tenantBLogin = await login(tenantBUser);

    expect(tenantALogin.sessionCookie).not.toBeNull();
    expect(tenantBLogin.sessionCookie).not.toBeNull();

    if (!tenantALogin.sessionCookie || !tenantBLogin.sessionCookie) {
      throw new Error("Expected both users to receive session cookies");
    }

    const meA = await getMe(tenantALogin.sessionCookie);
    const meB = await getMe(tenantBLogin.sessionCookie);

    expect(meA.response.status).toBe(200);
    expect(meB.response.status).toBe(200);
    expect("user" in meA.body).toBe(true);
    expect("user" in meB.body).toBe(true);

    if (!("user" in meA.body) || !("user" in meB.body)) {
      throw new Error("Expected authenticated user responses");
    }

    expect(meA.body.user).toEqual({
      userId: tenantAUser.userId,
      tenantId: tenantAUser.tenantId,
      email: tenantAUser.email,
      displayName: tenantAUser.displayName,
      emailVerifiedAt: tenantAUser.emailVerifiedAt?.toISOString() ?? null,
    });
    expect(meB.body.user).toEqual({
      userId: tenantBUser.userId,
      tenantId: tenantBUser.tenantId,
      email: tenantBUser.email,
      displayName: tenantBUser.displayName,
      emailVerifiedAt: tenantBUser.emailVerifiedAt?.toISOString() ?? null,
    });
    expect(meA.body.user.userId).not.toBe(tenantBUser.userId);
    expect(meA.body.user.tenantId).not.toBe(tenantBUser.tenantId);
    expect(meB.body.user.userId).not.toBe(tenantAUser.userId);
    expect(meB.body.user.tenantId).not.toBe(tenantAUser.tenantId);
  });
});
