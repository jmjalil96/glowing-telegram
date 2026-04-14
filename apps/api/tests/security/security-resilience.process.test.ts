import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthApiClient,
  type ErrorEnvelope,
} from "../helpers/auth-api.js";
import {
  createAuthFixtureUser,
  runMigrationsForConnectionString,
  startTestDatabase,
  type AuthFixtureUserRecord,
  type TestDatabase,
} from "../helpers/database.js";
import {
  mailboxNameFromEmail,
  startTestEmailSink,
  type TestEmailSink,
} from "../helpers/email.js";
import { waitForHttpReady, waitForHttpResponse } from "../helpers/http.js";
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

const TEST_ALLOWED_ORIGIN = "http://allowed.techbros.test";
const TEST_DISALLOWED_ORIGIN = "http://blocked.techbros.test";
const PROCESS_ENV = {
  LOG_LEVEL: "silent",
  CORS_ALLOWED_ORIGINS: TEST_ALLOWED_ORIGIN,
} as const;

describe("security and resilience contract", () => {
  let testDatabase: TestDatabase | undefined;
  let emailSink: TestEmailSink | undefined;
  let databaseProxy: TcpProxy | undefined;
  let serverProcess: StartedServerProcess | undefined;
  let port = 0;

  const getBaseUrl = (): string => `http://127.0.0.1:${port}`;

  const startServer = async (
    databaseUrl: string,
    extraEnv: Record<string, string | undefined> = {},
  ): Promise<StartedServerProcess> => {
    const startedProcess = startServerProcess({
      databaseUrl,
      port,
      extraEnv: {
        ...PROCESS_ENV,
        ...extraEnv,
      },
    });

    await waitForHttpReady(`${getBaseUrl()}/health`);
    await waitForHttpResponse(
      `${getBaseUrl()}/ready`,
      (response) => response.status === 200,
    );

    return startedProcess;
  };

  const createUser = async (
    options: Parameters<typeof createAuthFixtureUser>[1] = {},
  ): Promise<AuthFixtureUserRecord> => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    return createAuthFixtureUser(testDatabase.connectionString, options);
  };

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);
    emailSink = await startTestEmailSink();

    const databaseUrl = new URL(testDatabase.connectionString);
    databaseProxy = await startTcpProxy({
      targetHost: databaseUrl.hostname,
      targetPort: Number(databaseUrl.port),
    });

    port = await getFreePort();
    serverProcess = await startServer(testDatabase.connectionString, {
      SMTP_HOST: emailSink.smtpHost,
      SMTP_PORT: String(emailSink.smtpPort),
    });
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

    if (emailSink) {
      await emailSink.stop();
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("allowed-origin preflight succeeds for credentialed auth routes", async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: TEST_ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-request-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      TEST_ALLOWED_ORIGIN,
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "content-type",
    );
  });

  it("disallowed-origin preflight does not reflect the origin", async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: TEST_DISALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("allowed-origin actual responses carry the credentialed CORS contract", async () => {
    const user = await createUser();
    const response = await fetch(`${getBaseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        Origin: TEST_ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      TEST_ALLOWED_ORIGIN,
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("requests without Origin do not get accidental CORS reflection", async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("session cookie contract is hardened in test mode", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.setCookie).toContain("techbros_session=");
    expect(loginResult.setCookie).toContain("HttpOnly");
    expect(loginResult.setCookie).toContain("SameSite=Lax");
    expect(loginResult.setCookie).toContain("Path=/");
    expect(loginResult.setCookie).not.toContain("Secure");
  });

  it("session cookie contract is hardened in production mode", async () => {
    if (!testDatabase || !emailSink || !serverProcess) {
      throw new Error("Expected server dependencies to be initialized");
    }

    await stopProcess(serverProcess.childProcess);

    const productionPort = await getFreePort();
    const productionProcess = startServerProcess({
      databaseUrl: testDatabase.connectionString,
      port: productionPort,
      extraEnv: {
        NODE_ENV: "production",
        LOG_LEVEL: "silent",
        WEB_APP_URL: "https://app.techbros.test",
        CORS_ALLOWED_ORIGINS: "https://app.techbros.test",
        SMTP_HOST: emailSink.smtpHost,
        SMTP_PORT: String(emailSink.smtpPort),
        EMAIL_FROM: "no-reply@techbros.test",
      },
    });

    try {
      await waitForHttpReady(`http://127.0.0.1:${productionPort}/health`);
      await waitForHttpResponse(
        `http://127.0.0.1:${productionPort}/ready`,
        (response) => response.status === 200,
      );

      const user = await createUser();
      const productionApi = createAuthApiClient(
        `http://127.0.0.1:${productionPort}`,
      );
      const loginResult = await productionApi.login(user);

      expect(loginResult.response.status).toBe(200);
      expect(loginResult.setCookie).toContain("techbros_session=");
      expect(loginResult.setCookie).toContain("HttpOnly");
      expect(loginResult.setCookie).toContain("SameSite=Lax");
      expect(loginResult.setCookie).toContain("Path=/");
      expect(loginResult.setCookie).toContain("Secure");
    } finally {
      await stopProcess(productionProcess.childProcess);
      serverProcess = await startServer(testDatabase.connectionString, {
        SMTP_HOST: emailSink.smtpHost,
        SMTP_PORT: String(emailSink.smtpPort),
      });
    }
  });

  it("minimal intentional security headers are present on success and error responses", async () => {
    const successResponse = await fetch(`${getBaseUrl()}/api/v1/status`);

    expect(successResponse.status).toBe(200);
    expect(successResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(successResponse.headers.get("x-frame-options")).toBe("SAMEORIGIN");

    const errorResponse = await fetch(`${getBaseUrl()}/definitely-not-real`);

    expect(errorResponse.status).toBe(404);
    expect(errorResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(errorResponse.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("SMTP outage degrades forgot-password safely", async () => {
    if (!testDatabase || !emailSink || !serverProcess) {
      throw new Error("Expected server dependencies to be initialized");
    }

    await stopProcess(serverProcess.childProcess);

    const outagePort = await getFreePort();
    const outageMailboxUser = await createUser();
    const mailbox = mailboxNameFromEmail(outageMailboxUser.email);

    await emailSink.purgeMailbox(mailbox);

    const outageProcess = startServerProcess({
      databaseUrl: testDatabase.connectionString,
      port: outagePort,
      extraEnv: {
        ...PROCESS_ENV,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "9",
      },
    });

    try {
      await waitForHttpReady(`http://127.0.0.1:${outagePort}/health`);
      await waitForHttpResponse(
        `http://127.0.0.1:${outagePort}/ready`,
        (response) => response.status === 200,
      );

      const outageApi = createAuthApiClient(`http://127.0.0.1:${outagePort}`);
      const forgotPasswordResult = await outageApi.forgotPassword(
        outageMailboxUser.email,
      );

      expect(forgotPasswordResult.response.status).toBe(200);
      expect(forgotPasswordResult.body).toEqual({
        success: true,
      });

      await emailSink.expectNoMessage(mailbox);

      const statusResponse = await fetch(
        `http://127.0.0.1:${outagePort}/api/v1/status`,
      );

      expect(statusResponse.status).toBe(200);
      await expect(statusResponse.json()).resolves.toEqual({
        status: "ok",
      });
    } finally {
      await stopProcess(outageProcess.childProcess);
      serverProcess = await startServer(testDatabase.connectionString, {
        SMTP_HOST: emailSink.smtpHost,
        SMTP_PORT: String(emailSink.smtpPort),
      });
    }
  });

  it("database outage on authenticated requests fails closed without crashing the process", async () => {
    if (!databaseProxy || !testDatabase) {
      throw new Error("Expected database proxy and database to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const proxiedDatabaseUrl = new URL(testDatabase.connectionString);

    proxiedDatabaseUrl.hostname = databaseProxy.host;
    proxiedDatabaseUrl.port = String(databaseProxy.port);

    if (!serverProcess) {
      throw new Error("Expected server process to be initialized");
    }

    await stopProcess(serverProcess.childProcess);
    serverProcess = await startServer(proxiedDatabaseUrl.toString(), {
      SMTP_HOST: emailSink?.smtpHost,
      SMTP_PORT: emailSink ? String(emailSink.smtpPort) : undefined,
      PG_CONNECT_TIMEOUT_MS: "250",
    });

    const healthyLogin = await api.login(user);

    expect(healthyLogin.sessionCookie).not.toBeNull();

    if (!healthyLogin.sessionCookie) {
      throw new Error("Expected login to succeed before DB outage");
    }

    databaseProxy.disable();

    const meResult = await api.fetchJson<ErrorEnvelope>("/api/v1/auth/me", {
      headers: {
        cookie: healthyLogin.sessionCookie,
      },
    });

    expect(meResult.response.status).toBe(500);
    expect(meResult.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: [],
        requestId: meResult.requestId,
      },
    });

    const healthResponse = await fetch(`${getBaseUrl()}/health`);

    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      status: "ok",
    });

    databaseProxy.enable();

    await waitForHttpResponse(
      `${getBaseUrl()}/ready`,
      (response) => response.status === 200,
    );
  });

  it("forgot-password anti-enumeration remains stable", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const mailbox = mailboxNameFromEmail(user.email);
    const missingEmail = `missing-${Date.now()}@techbros.local`;
    const missingMailbox = mailboxNameFromEmail(missingEmail);

    await emailSink.purgeMailbox(mailbox);
    await emailSink.purgeMailbox(missingMailbox);

    const existingResponse = await fetch(
      `${getBaseUrl()}/api/v1/auth/forgot-password`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
        }),
      },
    );
    const missingResponse = await fetch(
      `${getBaseUrl()}/api/v1/auth/forgot-password`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: missingEmail,
        }),
      },
    );

    expect(existingResponse.status).toBe(200);
    expect(missingResponse.status).toBe(200);
    await expect(existingResponse.json()).resolves.toEqual({
      success: true,
    });
    await expect(missingResponse.json()).resolves.toEqual({
      success: true,
    });

    await emailSink.waitForLatestMessage(mailbox);
    await emailSink.expectNoMessage(missingMailbox);
  });
});
