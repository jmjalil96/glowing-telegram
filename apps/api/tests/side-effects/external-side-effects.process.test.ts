import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuthApiClient } from "../helpers/auth-api.js";
import { clearAuditLogs, findLatestAuditLog } from "../helpers/audit.js";
import {
  createAuthFixtureUser,
  createPasswordResetTokenFixture,
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
import { getFreePort } from "../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  type StartedServerProcess,
} from "../helpers/process.js";

const PROCESS_ENV = {
  LOG_LEVEL: "silent",
} as const;

const TEST_USER_AGENT = "techbros-contract-tests/1.0";

describe("external side-effect contract", () => {
  let testDatabase: TestDatabase | undefined;
  let emailSink: TestEmailSink | undefined;
  let serverProcess: StartedServerProcess | undefined;
  let port = 0;

  const getBaseUrl = (): string => `http://127.0.0.1:${port}`;

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

    port = await getFreePort();
    serverProcess = startServerProcess({
      databaseUrl: testDatabase.connectionString,
      port,
      extraEnv: {
        ...PROCESS_ENV,
        SMTP_HOST: emailSink.smtpHost,
        SMTP_PORT: String(emailSink.smtpPort),
      },
    });

    await waitForHttpReady(`${getBaseUrl()}/health`);
    await waitForHttpResponse(
      `${getBaseUrl()}/ready`,
      (response) => response.status === 200,
    );
  });

  beforeEach(async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    await clearAuditLogs(testDatabase.connectionString);
  });

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (emailSink) {
      await emailSink.stop();
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("forgot-password for an active user sends one reset email with the stable delivery contract", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const mailbox = mailboxNameFromEmail(user.email);
    const api = createAuthApiClient(getBaseUrl());

    await emailSink.purgeMailbox(mailbox);

    const response = await fetch(
      `${getBaseUrl()}/api/v1/auth/forgot-password`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": TEST_USER_AGENT,
        },
        body: JSON.stringify({
          email: user.email,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
    });

    const resetEmail = await emailSink.waitForLatestMessage(mailbox);
    const resetUrl = emailSink.extractResetUrl(resetEmail);

    expect(resetEmail.subject).toBe("Reset your Tech Bros password");
    expect(resetUrl.origin).toBe("http://localhost:5173");
    expect(resetUrl.pathname).toBe("/reset-password");
    expect(resetUrl.searchParams.get("token")).toBeTruthy();

    const forgotPasswordResult = await api.forgotPassword(user.email);

    expect(forgotPasswordResult.response.status).toBe(200);
  });

  it("forgot-password for a nonexistent account emits no email and no audit row", async () => {
    if (!emailSink || !testDatabase) {
      throw new Error("Expected email sink and database to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const missingEmail = `missing-${randomUUID()}@techbros.local`;
    const mailbox = mailboxNameFromEmail(missingEmail);
    const requestId = `forgot-password-missing-${randomUUID()}`;

    await emailSink.purgeMailbox(mailbox);

    const result = await api.fetchJson<{ success: boolean }>(
      "/api/v1/auth/forgot-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "user-agent": TEST_USER_AGENT,
        },
        body: JSON.stringify({
          email: missingEmail,
        }),
      },
    );

    expect(result.response.status).toBe(200);
    expect(result.body).toEqual({
      success: true,
    });

    await emailSink.expectNoMessage(mailbox);

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.password-reset.requested",
    });

    expect(auditLog).toBeNull();
  });

  it("forgot-password success records auth.password-reset.requested with stable audit fields", async () => {
    if (!emailSink || !testDatabase) {
      throw new Error("Expected email sink and database to be initialized");
    }

    const user = await createUser();
    const mailbox = mailboxNameFromEmail(user.email);
    const requestId = `forgot-password-success-${randomUUID()}`;

    await emailSink.purgeMailbox(mailbox);

    const result = await fetch(`${getBaseUrl()}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "user-agent": TEST_USER_AGENT,
      },
      body: JSON.stringify({
        email: user.email,
      }),
    });

    expect(result.status).toBe(200);
    await emailSink.waitForLatestMessage(mailbox);

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.password-reset.requested",
    });

    expect(auditLog).not.toBeNull();

    if (!auditLog) {
      throw new Error("Expected password-reset request audit row");
    }

    expect(auditLog.action).toBe("auth.password-reset.requested");
    expect(auditLog.requestId).toBe(requestId);
    expect(auditLog.tenantId).toBe(user.tenantId);
    expect(auditLog.actorUserId).toBe(user.userId);
    expect(auditLog.targetType).toBe("user");
    expect(auditLog.targetId).toBe(user.userId);
    expect(typeof auditLog.ipAddress).toBe("string");
    expect(auditLog.userAgent).toBe(TEST_USER_AGENT);
  });

  it("login success records auth.login.succeeded", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const requestId = `login-success-${randomUUID()}`;

    const loginResult = await api.fetchJson<{
      user: {
        userId: string;
      };
    }>("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "user-agent": TEST_USER_AGENT,
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    expect(loginResult.response.status).toBe(200);

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.login.succeeded",
    });

    expect(auditLog).not.toBeNull();

    if (!auditLog) {
      throw new Error("Expected login success audit row");
    }

    expect(auditLog.tenantId).toBe(user.tenantId);
    expect(auditLog.actorUserId).toBe(user.userId);
    expect(auditLog.targetType).toBe("user");
    expect(auditLog.targetId).toBe(user.userId);
    expect(auditLog.userAgent).toBe(TEST_USER_AGENT);
    expect(auditLog.metadata.method).toBe("password");
    expect(typeof auditLog.metadata.sessionId).toBe("string");
  });

  it("login failure records auth.login.failed with the stable reason payload", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const user = await createUser();
    const requestId = `login-failure-${randomUUID()}`;

    const response = await fetch(`${getBaseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "user-agent": TEST_USER_AGENT,
      },
      body: JSON.stringify({
        email: user.email,
        password: "definitely-wrong-password",
      }),
    });

    expect(response.status).toBe(401);

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.login.failed",
    });

    expect(auditLog).not.toBeNull();

    if (!auditLog) {
      throw new Error("Expected login failure audit row");
    }

    expect(auditLog.tenantId).toBe(user.tenantId);
    expect(auditLog.actorUserId).toBe(user.userId);
    expect(auditLog.targetType).toBe("user");
    expect(auditLog.targetId).toBe(user.userId);
    expect(auditLog.metadata.method).toBe("password");
    expect(auditLog.metadata.reason).toBe("invalid_password");
  });

  it("logout records auth.logout.succeeded", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const loginResult = await api.login(user);
    const requestId = `logout-success-${randomUUID()}`;

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const logoutResult = await api.fetchJson<{ success: boolean }>(
      "/api/v1/auth/logout",
      {
        method: "POST",
        headers: {
          cookie: loginResult.sessionCookie,
          "x-request-id": requestId,
          "user-agent": TEST_USER_AGENT,
        },
      },
    );

    expect(logoutResult.response.status).toBe(200);
    expect(logoutResult.body).toEqual({
      success: true,
    });

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.logout.succeeded",
    });

    expect(auditLog).not.toBeNull();

    if (!auditLog) {
      throw new Error("Expected logout audit row");
    }

    expect(auditLog.tenantId).toBe(user.tenantId);
    expect(auditLog.actorUserId).toBe(user.userId);
    expect(auditLog.targetType).toBe("user");
    expect(auditLog.targetId).toBe(user.userId);
    expect(typeof auditLog.metadata.sessionId).toBe("string");
  });

  it("reset-password completion records auth.password-reset.completed", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const user = await createUser();
    const requestId = `reset-password-completed-${randomUUID()}`;
    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: user.userId,
    });

    const result = await fetch(`${getBaseUrl()}/api/v1/auth/reset-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "user-agent": TEST_USER_AGENT,
      },
      body: JSON.stringify({
        token: resetToken.rawToken,
        password: "Techbros456!",
      }),
    });

    expect(result.status).toBe(200);

    const auditLog = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId,
      action: "auth.password-reset.completed",
    });

    expect(auditLog).not.toBeNull();

    if (!auditLog) {
      throw new Error("Expected password-reset completion audit row");
    }

    expect(auditLog.tenantId).toBe(user.tenantId);
    expect(auditLog.actorUserId).toBe(user.userId);
    expect(auditLog.targetType).toBe("user");
    expect(auditLog.targetId).toBe(user.userId);
  });

  it("audit rows stay correlated to the response requestId", async () => {
    if (!emailSink || !testDatabase) {
      throw new Error("Expected email sink and database to be initialized");
    }

    const user = await createUser();
    const mailbox = mailboxNameFromEmail(user.email);
    const api = createAuthApiClient(getBaseUrl());

    await emailSink.purgeMailbox(mailbox);

    const loginRequestId = `audit-correlation-login-${randomUUID()}`;
    const loginResult = await api.fetchJson<{
      user: {
        userId: string;
      };
    }>("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": loginRequestId,
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });
    const loginCookie = loginResult.response.headers.get("set-cookie");

    expect(loginResult.requestId).toBe(loginRequestId);

    const loginAudit = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId: loginResult.requestId,
      action: "auth.login.succeeded",
    });

    expect(loginAudit?.requestId).toBe(loginResult.requestId);

    const forgotRequestId = `audit-correlation-forgot-${randomUUID()}`;
    const forgotResult = await api.fetchJson<{ success: boolean }>(
      "/api/v1/auth/forgot-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": forgotRequestId,
        },
        body: JSON.stringify({
          email: user.email,
        }),
      },
    );

    await emailSink.waitForLatestMessage(mailbox);

    const forgotAudit = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId: forgotResult.requestId,
      action: "auth.password-reset.requested",
    });

    expect(forgotAudit?.requestId).toBe(forgotResult.requestId);

    if (!loginCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const sessionCookie = api.extractSessionCookie(loginCookie);

    if (!sessionCookie) {
      throw new Error("Expected session cookie to be parseable");
    }

    const logoutRequestId = `audit-correlation-logout-${randomUUID()}`;
    const logoutResult = await api.fetchJson<{ success: boolean }>(
      "/api/v1/auth/logout",
      {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          "x-request-id": logoutRequestId,
        },
      },
    );
    const logoutAudit = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId: logoutResult.requestId,
      action: "auth.logout.succeeded",
    });

    expect(logoutAudit?.requestId).toBe(logoutResult.requestId);

    const resetRequestId = `audit-correlation-reset-${randomUUID()}`;
    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: user.userId,
    });
    const resetResult = await api.fetchJson<{ success: boolean }>(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": resetRequestId,
        },
        body: JSON.stringify({
          token: resetToken.rawToken,
          password: "Techbros456!",
        }),
      },
    );
    const resetAudit = await findLatestAuditLog({
      connectionString: testDatabase.connectionString,
      requestId: resetResult.requestId,
      action: "auth.password-reset.completed",
    });

    expect(resetAudit?.requestId).toBe(resetResult.requestId);
  });
});
