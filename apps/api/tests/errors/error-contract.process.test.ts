import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthApiClient,
  type ErrorEnvelope,
} from "../helpers/auth-api.js";
import {
  createAuthFixtureUser,
  createPasswordResetTokenFixture,
  runMigrationsForConnectionString,
  startTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";
import {
  getFreePort,
  startTcpProxy,
  type TcpProxy,
} from "../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  type StartedServerProcess,
} from "../helpers/process.js";

const PROCESS_ENV = {
  LOG_LEVEL: "silent",
  PG_CONNECT_TIMEOUT_MS: "250",
} as const;

interface ValidationDetail {
  source: "body" | "params" | "query";
  path: string;
  message: string;
  code: string;
}

describe("error contract", () => {
  let testDatabase: TestDatabase | undefined;
  let databaseProxy: TcpProxy | undefined;
  let serverProcess: StartedServerProcess | undefined;
  let port = 0;

  const getBaseUrl = (): string => `http://127.0.0.1:${port}`;

  const getProxiedDatabaseUrl = (): string => {
    if (!testDatabase || !databaseProxy) {
      throw new Error("Expected database and proxy to be initialized");
    }

    const connectionUrl = new URL(testDatabase.connectionString);

    connectionUrl.hostname = databaseProxy.host;
    connectionUrl.port = String(databaseProxy.port);

    return connectionUrl.toString();
  };

  const waitForHealthyServer = async (): Promise<void> => {
    const { waitForHttpReady, waitForHttpResponse } =
      await import("../helpers/http.js");

    await waitForHttpReady(`${getBaseUrl()}/health`);
    await waitForHttpResponse(
      `${getBaseUrl()}/ready`,
      (response) => response.status === 200,
    );
  };

  const startServer = async (): Promise<void> => {
    serverProcess = startServerProcess({
      databaseUrl: getProxiedDatabaseUrl(),
      port,
      extraEnv: {
        ...PROCESS_ENV,
      },
    });

    await waitForHealthyServer();
  };

  const expectErrorEnvelope = async ({
    description,
    execute,
    expectedStatus,
    expectedCode,
    expectedRequestId,
    expectsValidationDetails = false,
  }: {
    description: string;
    execute: () => Promise<{
      response: Response;
      body: ErrorEnvelope;
      requestId: string;
    }>;
    expectedStatus: number;
    expectedCode: string;
    expectedRequestId: string;
    expectsValidationDetails?: boolean;
  }): Promise<void> => {
    const { response, body, requestId } = await execute();

    expect(response.status, description).toBe(expectedStatus);
    expect(requestId, description).toBe(expectedRequestId);
    expect(body.error.requestId, description).toBe(expectedRequestId);
    expect(body.error.code, description).toBe(expectedCode);
    expect(typeof body.error.message, description).toBe("string");
    expect(Array.isArray(body.error.details), description).toBe(true);

    if (expectsValidationDetails) {
      expect(body.error.details.length, description).toBeGreaterThan(0);

      for (const detail of body.error.details as ValidationDetail[]) {
        expect(typeof detail.source, description).toBe("string");
        expect(typeof detail.path, description).toBe("string");
        expect(typeof detail.message, description).toBe("string");
        expect(typeof detail.code, description).toBe("string");
      }
    } else {
      expect(body.error.details, description).toEqual([]);
    }
  };

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);

    const databaseUrl = new URL(testDatabase.connectionString);
    const proxyPort = await getFreePort();

    databaseProxy = await startTcpProxy({
      targetHost: databaseUrl.hostname,
      targetPort: Number(databaseUrl.port),
      listenPort: proxyPort,
    });

    port = await getFreePort();
    await startServer();
  });

  afterEach(() => {
    databaseProxy?.enable();
  });

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (databaseProxy) {
      await databaseProxy.close();
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("core failure classes share one stable error envelope", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const inactiveUser = await createAuthFixtureUser(
      testDatabase?.connectionString ?? "",
      {
        isActive: false,
      },
    );
    const unverifiedUser = await createAuthFixtureUser(
      testDatabase?.connectionString ?? "",
      {
        emailVerifiedAt: null,
      },
    );

    await expectErrorEnvelope({
      description: "VALIDATION_ERROR",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-validation",
          },
          body: JSON.stringify({}),
        }),
      expectedStatus: 400,
      expectedCode: "VALIDATION_ERROR",
      expectedRequestId: "error-validation",
      expectsValidationDetails: true,
    });

    await expectErrorEnvelope({
      description: "INVALID_JSON",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-invalid-json",
          },
          body: '{"email":"broken"',
        }),
      expectedStatus: 400,
      expectedCode: "INVALID_JSON",
      expectedRequestId: "error-invalid-json",
    });

    await expectErrorEnvelope({
      description: "PAYLOAD_TOO_LARGE",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-payload-too-large",
          },
          body: JSON.stringify({
            email: "a".repeat(1_100_000),
            password: "x",
          }),
        }),
      expectedStatus: 413,
      expectedCode: "PAYLOAD_TOO_LARGE",
      expectedRequestId: "error-payload-too-large",
    });

    await expectErrorEnvelope({
      description: "NOT_FOUND",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/definitely-not-real", {
          headers: {
            "x-request-id": "error-not-found",
          },
        }),
      expectedStatus: 404,
      expectedCode: "NOT_FOUND",
      expectedRequestId: "error-not-found",
    });

    await expectErrorEnvelope({
      description: "UNAUTHORIZED",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/me", {
          headers: {
            "x-request-id": "error-unauthorized",
          },
        }),
      expectedStatus: 401,
      expectedCode: "UNAUTHORIZED",
      expectedRequestId: "error-unauthorized",
    });

    await expectErrorEnvelope({
      description: "INVALID_RESET_TOKEN",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/reset-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-invalid-reset-token",
          },
          body: JSON.stringify({
            token: "definitely-invalid-token",
            password: "Techbros123!",
          }),
        }),
      expectedStatus: 400,
      expectedCode: "INVALID_RESET_TOKEN",
      expectedRequestId: "error-invalid-reset-token",
    });

    await expectErrorEnvelope({
      description: "ACCOUNT_INACTIVE",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-account-inactive",
          },
          body: JSON.stringify({
            email: inactiveUser.email,
            password: inactiveUser.password,
          }),
        }),
      expectedStatus: 403,
      expectedCode: "ACCOUNT_INACTIVE",
      expectedRequestId: "error-account-inactive",
    });

    await expectErrorEnvelope({
      description: "EMAIL_NOT_VERIFIED",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-email-not-verified",
          },
          body: JSON.stringify({
            email: unverifiedUser.email,
            password: unverifiedUser.password,
          }),
        }),
      expectedStatus: 403,
      expectedCode: "EMAIL_NOT_VERIFIED",
      expectedRequestId: "error-email-not-verified",
    });
  });

  it("unexpected server failures return the stable 500 contract", async () => {
    if (!databaseProxy) {
      throw new Error("Expected database proxy to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const user = await createAuthFixtureUser(
      testDatabase?.connectionString ?? "",
    );
    const loginResult = await api.login(user);

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    databaseProxy.disable();

    const deadline = Date.now() + 5_000;
    let internalErrorResponse:
      | {
          response: Response;
          body: ErrorEnvelope;
          requestId: string;
        }
      | undefined;

    while (Date.now() < deadline) {
      try {
        const result = await api.fetchJson<ErrorEnvelope>("/api/v1/auth/me", {
          headers: {
            cookie: loginResult.sessionCookie,
            "x-request-id": "error-internal",
          },
        });

        if (result.response.status === 500) {
          internalErrorResponse = result;
          break;
        }
      } catch {
        // Retry while the connection failure propagates through the pool.
      }
    }

    expect(internalErrorResponse).toBeDefined();
    expect(internalErrorResponse?.response.status).toBe(500);
    expect(internalErrorResponse?.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: [],
        requestId: "error-internal",
      },
    });
  });

  it("deterministic failures stay deterministic on repeat", async () => {
    const api = createAuthApiClient(getBaseUrl());

    for (const requestId of [
      "repeat-invalid-reset-1",
      "repeat-invalid-reset-2",
    ]) {
      await expectErrorEnvelope({
        description: requestId,
        execute: () =>
          api.fetchJson<ErrorEnvelope>("/api/v1/auth/reset-password", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
            },
            body: JSON.stringify({
              token: "definitely-invalid-token",
              password: "Techbros123!",
            }),
          }),
        expectedStatus: 400,
        expectedCode: "INVALID_RESET_TOKEN",
        expectedRequestId: requestId,
      });
    }

    const user = await createAuthFixtureUser(
      testDatabase?.connectionString ?? "",
    );
    const loginResult = await api.login(user);

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const logoutResult = await api.logout(loginResult.sessionCookie);

    expect(logoutResult.response.status).toBe(200);

    for (const requestId of [
      "repeat-unauthorized-1",
      "repeat-unauthorized-2",
    ]) {
      await expectErrorEnvelope({
        description: requestId,
        execute: () =>
          api.fetchJson<ErrorEnvelope>("/api/v1/auth/me", {
            headers: {
              cookie: loginResult.sessionCookie ?? "",
              "x-request-id": requestId,
            },
          }),
        expectedStatus: 401,
        expectedCode: "UNAUTHORIZED",
        expectedRequestId: requestId,
      });
    }
  });

  it("expired reset token returns INVALID_RESET_TOKEN", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const user = await createAuthFixtureUser(
      testDatabase?.connectionString ?? "",
    );
    const expiredToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase?.connectionString ?? "",
      userId: user.userId,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expectErrorEnvelope({
      description: "expired reset token",
      execute: () =>
        api.fetchJson<ErrorEnvelope>("/api/v1/auth/reset-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "error-expired-reset-token",
          },
          body: JSON.stringify({
            token: expiredToken.rawToken,
            password: "Techbros123!",
          }),
        }),
      expectedStatus: 400,
      expectedCode: "INVALID_RESET_TOKEN",
      expectedRequestId: "error-expired-reset-token",
    });
  });
});
