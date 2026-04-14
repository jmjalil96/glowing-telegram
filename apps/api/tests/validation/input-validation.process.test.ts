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

interface ValidationDetail {
  source: "body" | "params" | "query";
  path: string;
  message: string;
  code: string;
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: ValidationDetail[];
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

describe("input and validation contract", () => {
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
    init: RequestInit,
    expectedStatus: number,
    expectedCode: string,
    expectedRequestId?: string,
  ): Promise<ErrorEnvelope["error"]> => {
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

    return body.error;
  };

  const getBodyDetail = (
    details: ValidationDetail[],
    path: string,
  ): ValidationDetail | undefined =>
    details.find((detail) => detail.source === "body" && detail.path === path);

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

  it("POST /api/v1/auth/login with malformed JSON returns the parser contract", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"email":"broken"',
      },
      400,
      "INVALID_JSON",
    );

    expect(error.details).toEqual([]);
  });

  it("POST /api/v1/auth/login with a payload larger than 1mb returns the payload-limit contract", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "a".repeat(1_100_000),
          password: "x",
        }),
      },
      413,
      "PAYLOAD_TOO_LARGE",
    );

    expect(error.details).toEqual([]);
  });

  it("POST /api/v1/auth/login with an empty object returns required-field validation errors", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      400,
      "VALIDATION_ERROR",
    );
    const emailDetail = getBodyDetail(error.details, "email");
    const passwordDetail = getBodyDetail(error.details, "password");

    expect(emailDetail).toBeDefined();
    expect(passwordDetail).toBeDefined();
    expect(emailDetail?.code.length ?? 0).toBeGreaterThan(0);
    expect(passwordDetail?.code.length ?? 0).toBeGreaterThan(0);
    expect(emailDetail?.message.length ?? 0).toBeGreaterThan(0);
    expect(passwordDetail?.message.length ?? 0).toBeGreaterThan(0);
  });

  it("POST /api/v1/auth/login with an invalid email format returns a field-specific validation error", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
          password: "x",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const emailDetail = getBodyDetail(error.details, "email");

    expect(emailDetail).toBeDefined();
    expect(emailDetail?.code.length ?? 0).toBeGreaterThan(0);
    expect(emailDetail?.message.length ?? 0).toBeGreaterThan(0);
  });

  it("POST /api/v1/auth/reset-password with a short password returns the public length-constraint failure", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "reset-token",
          password: "short",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const passwordDetail = getBodyDetail(error.details, "password");

    expect(passwordDetail).toBeDefined();
    expect(passwordDetail?.code.length ?? 0).toBeGreaterThan(0);
    expect(passwordDetail?.message.length ?? 0).toBeGreaterThan(0);
  });

  it("POST /api/v1/auth/reset-password aggregates multiple validation failures", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "   ",
          password: "short",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const tokenDetail = getBodyDetail(error.details, "token");
    const passwordDetail = getBodyDetail(error.details, "password");

    expect(tokenDetail).toBeDefined();
    expect(passwordDetail).toBeDefined();
    expect(error.details.length).toBeGreaterThanOrEqual(2);
  });

  it("POST /api/v1/auth/login validates before auth semantics", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
          password: "Techbros123!",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );

    expect(error.message).toBe("Request validation failed");
  });

  it("POST /api/v1/auth/login with text/plain falls through to the validation contract", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: JSON.stringify({
          email: fixtureUser?.email ?? "missing-user@techbros.local",
          password: fixtureUser?.password ?? "Techbros123!",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const bodyDetail = getBodyDetail(error.details, "");

    expect(error.details.length).toBeGreaterThan(0);
    expect(bodyDetail).toBeDefined();
    expect(bodyDetail?.code).toBe("invalid_type");
  });

  it("POST /api/v1/auth/login without content-type falls through to the validation contract", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: fixtureUser?.email ?? "missing-user@techbros.local",
          password: fixtureUser?.password ?? "Techbros123!",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const bodyDetail = getBodyDetail(error.details, "");

    expect(error.details.length).toBeGreaterThan(0);
    expect(bodyDetail).toBeDefined();
    expect(bodyDetail?.code).toBe("invalid_type");
  });

  it("validation failures preserve request-id symmetry", async () => {
    const requestId = "validation-contract-id";

    await expectErrorContract(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({}),
      },
      400,
      "VALIDATION_ERROR",
      requestId,
    );
  });

  it("POST /api/v1/auth/login accepts trimmed and mixed-case email when normalization makes it valid", async () => {
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
          email: `  ${fixtureUser.email.toUpperCase()}  `,
          password: fixtureUser.password,
        }),
      },
    );
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(fixtureUser.email);
    expect(typeof body.user.userId).toBe("string");
    expect(typeof body.user.tenantId).toBe("string");
    expect(setCookie).toContain("techbros_session=");
  });

  it("POST /api/v1/auth/forgot-password with invalid email returns the same validation envelope", async () => {
    const error = await expectErrorContract(
      "/api/v1/auth/forgot-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
        }),
      },
      400,
      "VALIDATION_ERROR",
    );
    const emailDetail = getBodyDetail(error.details, "email");

    expect(emailDetail).toBeDefined();
    expect(emailDetail?.code.length ?? 0).toBeGreaterThan(0);
    expect(emailDetail?.message.length ?? 0).toBeGreaterThan(0);
  });
});
