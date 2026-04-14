import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
import { getFreePort } from "../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  type StartedServerProcess,
} from "../helpers/process.js";

const PROCESS_ENV = {
  LOG_LEVEL: "silent",
} as const;

describe("password reset workflow contract", () => {
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

  it("forgot-password -> email -> reset-password -> login again", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const mailbox = mailboxNameFromEmail(user.email);

    await emailSink.purgeMailbox(mailbox);

    const forgotPasswordResult = await api.forgotPassword(user.email);

    expect(forgotPasswordResult.response.status).toBe(200);
    expect(forgotPasswordResult.body).toEqual({
      success: true,
    });

    const resetEmail = await emailSink.waitForLatestMessage(mailbox);
    const resetToken = emailSink.extractResetToken(resetEmail);
    const newPassword = "Techbros456!";

    const resetResult = await api.resetPassword({
      token: resetToken,
      password: newPassword,
    });

    expect(resetResult.response.status).toBe(200);
    expect(resetResult.body).toEqual({
      success: true,
    });

    const oldLogin = await api.login(user);

    expect(oldLogin.response.status).toBe(401);
    expect(oldLogin.sessionCookie).toBeNull();

    const newLogin = await api.login({
      email: user.email,
      password: newPassword,
    });

    expect(newLogin.response.status).toBe(200);
    expect(newLogin.sessionCookie).not.toBeNull();

    if (!newLogin.sessionCookie) {
      throw new Error(
        "Expected login with the new password to issue a session",
      );
    }

    const meResult = await api.getMe(newLogin.sessionCookie);

    expect(meResult.response.status).toBe(200);
  });

  it("forgot-password for a nonexistent account stays outwardly identical and sends no email", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const missingEmail = `missing-${randomUUID()}@techbros.local`;
    const mailbox = mailboxNameFromEmail(missingEmail);

    await emailSink.purgeMailbox(mailbox);

    const forgotPasswordResult = await api.forgotPassword(missingEmail);

    expect(forgotPasswordResult.response.status).toBe(200);
    expect(forgotPasswordResult.body).toEqual({
      success: true,
    });

    await emailSink.expectNoMessage(mailbox);
  });

  it("a newer forgot-password request invalidates the earlier reset link", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const mailbox = mailboxNameFromEmail(user.email);

    await emailSink.purgeMailbox(mailbox);

    const firstForgotPassword = await api.forgotPassword(user.email);

    expect(firstForgotPassword.response.status).toBe(200);

    const firstEmail = await emailSink.waitForLatestMessage(mailbox);
    const firstToken = emailSink.extractResetToken(firstEmail);

    const secondForgotPassword = await api.forgotPassword(user.email);

    expect(secondForgotPassword.response.status).toBe(200);

    const secondEmail = await emailSink.waitForLatestMessage(mailbox, {
      afterMessageId: firstEmail.id,
    });
    const secondToken = emailSink.extractResetToken(secondEmail);

    expect(secondEmail.id).not.toBe(firstEmail.id);

    const firstReset = await api.resetPassword({
      token: firstToken,
      password: "Techbros456!",
    });

    expect(firstReset.response.status).toBe(400);
    expect((firstReset.body as ErrorEnvelope).error.code).toBe(
      "INVALID_RESET_TOKEN",
    );

    const secondReset = await api.resetPassword({
      token: secondToken,
      password: "Techbros456!",
    });

    expect(secondReset.response.status).toBe(200);
    expect(secondReset.body).toEqual({
      success: true,
    });
  });

  it("reset link is single-use", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const mailbox = mailboxNameFromEmail(user.email);

    await emailSink.purgeMailbox(mailbox);
    await api.forgotPassword(user.email);

    const resetEmail = await emailSink.waitForLatestMessage(mailbox);
    const resetToken = emailSink.extractResetToken(resetEmail);

    const firstReset = await api.resetPassword({
      token: resetToken,
      password: "Techbros456!",
    });

    expect(firstReset.response.status).toBe(200);

    const secondReset = await api.resetPassword({
      token: resetToken,
      password: "Techbros789!",
    });

    expect(secondReset.response.status).toBe(400);
    expect((secondReset.body as ErrorEnvelope).error.code).toBe(
      "INVALID_RESET_TOKEN",
    );
  });

  it("successful reset revokes existing sessions and clears the cookie", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser();
    const api = createAuthApiClient(getBaseUrl());
    const mailbox = mailboxNameFromEmail(user.email);

    await emailSink.purgeMailbox(mailbox);

    const loginResult = await api.login(user);

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    await api.forgotPassword(user.email);

    const resetEmail = await emailSink.waitForLatestMessage(mailbox);
    const resetToken = emailSink.extractResetToken(resetEmail);
    const resetResult = await api.resetPassword({
      token: resetToken,
      password: "Techbros456!",
      cookie: loginResult.sessionCookie,
    });

    expect(resetResult.response.status).toBe(200);
    expect(resetResult.body).toEqual({
      success: true,
    });
    expect(resetResult.setCookie).toContain("techbros_session=");
    expect(resetResult.setCookie).toContain("Path=/");

    const meResult = await api.getMe(loginResult.sessionCookie);

    expect(meResult.response.status).toBe(401);
    expect((meResult.body as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
  });

  it("active unverified user can complete reset and then log in", async () => {
    if (!emailSink) {
      throw new Error("Expected email sink to be initialized");
    }

    const user = await createUser({
      emailVerifiedAt: null,
    });
    const api = createAuthApiClient(getBaseUrl());
    const mailbox = mailboxNameFromEmail(user.email);

    await emailSink.purgeMailbox(mailbox);
    await api.forgotPassword(user.email);

    const resetEmail = await emailSink.waitForLatestMessage(mailbox);
    const resetToken = emailSink.extractResetToken(resetEmail);

    const resetResult = await api.resetPassword({
      token: resetToken,
      password: "Techbros456!",
    });

    expect(resetResult.response.status).toBe(200);

    const loginResult = await api.login({
      email: user.email,
      password: "Techbros456!",
    });

    expect(loginResult.response.status).toBe(200);
    expect("user" in loginResult.body).toBe(true);

    if (!("user" in loginResult.body)) {
      throw new Error("Expected authenticated user body");
    }

    expect(loginResult.body.user.emailVerifiedAt).not.toBeNull();
  });
});
