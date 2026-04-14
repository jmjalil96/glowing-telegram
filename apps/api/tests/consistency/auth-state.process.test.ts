import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthApiClient,
  type ErrorEnvelope,
} from "../helpers/auth-api.js";
import {
  createAuthFixtureUser,
  createPasswordResetTokenFixture,
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

describe("auth state persistence and consistency contract", () => {
  let testDatabase: TestDatabase | undefined;
  let serverProcess: StartedServerProcess | undefined;
  let port = 0;

  const getBaseUrl = (): string => `http://127.0.0.1:${port}`;

  const startServer = async (): Promise<void> => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

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
  };

  const restartServer = async (): Promise<void> => {
    if (!serverProcess) {
      throw new Error("Expected server process to be initialized");
    }

    await stopProcess(serverProcess.childProcess);
    await startServer();
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
    port = await getFreePort();
    await startServer();
  });

  afterAll(async () => {
    if (serverProcess) {
      await stopProcess(serverProcess.childProcess);
    }

    if (testDatabase) {
      await testDatabase.stop();
    }
  });

  it("session survives API restart", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    await restartServer();

    const meResult = await api.getMe(loginResult.sessionCookie);

    expect(meResult.response.status).toBe(200);
  });

  it("logout revocation survives API restart", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const logoutResult = await api.logout(loginResult.sessionCookie);

    expect(logoutResult.response.status).toBe(200);

    await restartServer();

    const meResult = await api.getMe(loginResult.sessionCookie);

    expect(meResult.response.status).toBe(401);
    expect((meResult.body as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
  });

  it("password reset persists across restart", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const newPassword = "Techbros456!";
    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: user.userId,
    });

    const resetResult = await api.resetPassword({
      token: resetToken.rawToken,
      password: newPassword,
    });

    expect(resetResult.response.status).toBe(200);

    await restartServer();

    const oldLogin = await api.login(user);

    expect(oldLogin.response.status).toBe(401);

    const newLogin = await api.login({
      email: user.email,
      password: newPassword,
    });

    expect(newLogin.response.status).toBe(200);
  });

  it("read-after-write holds for logout", async () => {
    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const logoutResult = await api.logout(loginResult.sessionCookie);

    expect(logoutResult.response.status).toBe(200);

    const meResult = await api.getMe(loginResult.sessionCookie);

    expect(meResult.response.status).toBe(401);
    expect((meResult.body as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
  });

  it("read-after-write holds for reset", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const loginResult = await api.login(user);

    expect(loginResult.sessionCookie).not.toBeNull();

    if (!loginResult.sessionCookie) {
      throw new Error("Expected login to issue a session cookie");
    }

    const newPassword = "Techbros456!";
    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: user.userId,
    });
    const resetResult = await api.resetPassword({
      token: resetToken.rawToken,
      password: newPassword,
    });

    expect(resetResult.response.status).toBe(200);

    const meResult = await api.getMe(loginResult.sessionCookie);

    expect(meResult.response.status).toBe(401);

    const newLogin = await api.login({
      email: user.email,
      password: newPassword,
    });

    expect(newLogin.response.status).toBe(200);
  });

  it("single-use reset token is race-safe under concurrency", async () => {
    if (!testDatabase) {
      throw new Error("Expected test database to be initialized");
    }

    const api = createAuthApiClient(getBaseUrl());
    const user = await createUser();
    const resetToken = await createPasswordResetTokenFixture({
      connectionString: testDatabase.connectionString,
      userId: user.userId,
    });
    const candidatePasswords = ["Techbros456!", "Techbros789!"] as const;

    const responses = await Promise.all(
      candidatePasswords.map((password) =>
        api.resetPassword({
          token: resetToken.rawToken,
          password,
        }),
      ),
    );
    const successResponses = responses.filter(
      (result) => result.response.status === 200,
    );
    const failureResponses = responses.filter(
      (result) => result.response.status === 400,
    );

    expect(successResponses).toHaveLength(1);
    expect(failureResponses).toHaveLength(1);
    expect((failureResponses[0]?.body as ErrorEnvelope).error.code).toBe(
      "INVALID_RESET_TOKEN",
    );

    const oldLogin = await api.login(user);

    expect(oldLogin.response.status).toBe(401);

    const loginResults = await Promise.all(
      candidatePasswords.map((password) =>
        api.login({
          email: user.email,
          password,
        }),
      ),
    );
    const successfulLogins = loginResults.filter(
      (result) => result.response.status === 200,
    );

    expect(successfulLogins).toHaveLength(1);
  });
});
