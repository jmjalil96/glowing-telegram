import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthFixtureUser,
  runMigrationsForConnectionString,
  startTestDatabase,
  type AuthFixtureUserRecord,
  type TestDatabase,
} from "../helpers/database.js";
import { waitForHttpReady, waitForHttpResponse } from "../helpers/http.js";
import { getFreePort } from "../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  type StartedServerProcess,
} from "../helpers/process.js";

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

describe("HTTP contract", () => {
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

  const expectErrorContract = async (
    path: string,
    expectedStatus: number,
    expectedCode: string,
    init?: RequestInit,
    expectedRequestId?: string,
  ): Promise<void> => {
    const { response, body, requestId } = await fetchJson<ErrorEnvelope>(
      path,
      init,
    );

    expect(response.status).toBe(expectedStatus);
    expect(body.error.code).toBe(expectedCode);
    expect(body.error.requestId).toBe(expectedRequestId ?? requestId);

    if (expectedRequestId) {
      expect(requestId).toBe(expectedRequestId);
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

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("GET /health returns the stable success contract", async () => {
    const { response, body, requestId } = await fetchJson<{ status: string }>(
      "/health",
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
    });
    expect(requestId.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/status returns the stable versioned success contract", async () => {
    const { response, body, requestId } = await fetchJson<{ status: string }>(
      "/api/v1/status",
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
    });
    expect(requestId.length).toBeGreaterThan(0);
  });

  it("GET /ready returns the stable healthy readiness contract", async () => {
    const { response, body, requestId } = await fetchJson<{
      status: string;
      checks: {
        database: string;
      };
    }>("/ready");

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      checks: {
        database: "ok",
      },
    });
    expect(requestId.length).toBeGreaterThan(0);
  });

  it("GET /api/status is rejected because the route is not versioned", async () => {
    await expectErrorContract("/api/status", 404, "NOT_FOUND");
  });

  it("GET /api/v2/status is rejected because the version is unsupported", async () => {
    await expectErrorContract("/api/v2/status", 404, "NOT_FOUND");
  });

  it("POST /api/v1/status preserves the chosen wrong-method contract", async () => {
    await expectErrorContract("/api/v1/status", 404, "NOT_FOUND", {
      method: "POST",
    });
  });

  it("GET /definitely-not-real preserves the generic not-found contract", async () => {
    await expectErrorContract("/definitely-not-real", 404, "NOT_FOUND");
  });

  it("GET /api/v1/auth/me without credentials returns the stable unauthenticated contract", async () => {
    await expectErrorContract("/api/v1/auth/me", 401, "UNAUTHORIZED");
  });

  it("POST /api/v1/auth/logout without credentials returns the same unauthenticated contract", async () => {
    await expectErrorContract("/api/v1/auth/logout", 401, "UNAUTHORIZED", {
      method: "POST",
    });
  });

  it("representative wrong methods on auth routes preserve the chosen 404 contract", async () => {
    await expectErrorContract(
      "/api/v1/auth/login",
      404,
      "NOT_FOUND",
      {
        method: "GET",
        headers: {
          "x-request-id": "wrong-method-auth-login",
        },
      },
      "wrong-method-auth-login",
    );

    await expectErrorContract(
      "/api/v1/auth/me",
      404,
      "NOT_FOUND",
      {
        method: "DELETE",
        headers: {
          "x-request-id": "wrong-method-auth-me",
        },
      },
      "wrong-method-auth-me",
    );

    await expectErrorContract(
      "/api/v1/auth/logout",
      404,
      "NOT_FOUND",
      {
        method: "GET",
        headers: {
          "x-request-id": "wrong-method-auth-logout",
        },
      },
      "wrong-method-auth-logout",
    );
  });

  it("x-request-id is echoed on a success response", async () => {
    const requestId = "contract-success-id";
    const response = await fetch(`${getBaseUrl()}/api/v1/status`, {
      headers: {
        "x-request-id": requestId,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("x-request-id is echoed on an error response", async () => {
    const requestId = "contract-error-id";

    await expectErrorContract(
      "/definitely-not-real",
      404,
      "NOT_FOUND",
      {
        headers: {
          "x-request-id": requestId,
        },
      },
      requestId,
    );
  });

  it("POST /api/v1/auth/login returns one stable authenticated success shape", async () => {
    if (!fixtureUser) {
      throw new Error("Expected auth fixture user to be initialized");
    }

    const { response, body } = await fetchJson<LoginSuccessBody>(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: fixtureUser.email,
          password: fixtureUser.password,
        }),
      },
    );
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(typeof body.user.userId).toBe("string");
    expect(typeof body.user.tenantId).toBe("string");
    expect(body.user.email).toBe(fixtureUser.email);
    expect(typeof body.user.displayName).toBe("string");
    expect(typeof body.user.emailVerifiedAt).toBe("string");
    expect(body.user.userId.length).toBeGreaterThan(0);
    expect(body.user.tenantId.length).toBeGreaterThan(0);
    expect(body.user.displayName?.length ?? 0).toBeGreaterThan(0);
    expect(body.user.emailVerifiedAt?.length ?? 0).toBeGreaterThan(0);
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("techbros_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
  });
});
