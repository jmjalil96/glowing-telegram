import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { importFresh } from "../helpers/module.js";

interface ApiErrorResponseBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

describe("app operational integration", () => {
  let app: Awaited<ReturnType<typeof loadApp>>;
  let closePool: Awaited<ReturnType<typeof loadDbClient>>["closePool"] | null =
    null;

  beforeAll(async () => {
    app = await loadApp();
    ({ closePool } = await loadDbClient());
  });

  afterAll(async () => {
    await closePool?.();
  });

  it("returns 200 for GET /health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
    });
  });

  it("returns 200 for GET /api/v1/status", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
    });
  });

  it("applies middleware to GET /api/v1/status", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).not.toHaveLength(0);
  });

  it("returns a JSON not-found error envelope under /api/v1", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route not found",
      details: [],
    });
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("returns a JSON not-found error envelope", async () => {
    const response = await request(app).get("/does-not-exist");
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route not found",
      details: [],
    });
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("generates an x-request-id when one is not provided", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).not.toHaveLength(0);
  });

  it("preserves an inbound x-request-id", async () => {
    const requestId = "req-test-123";

    const response = await request(app)
      .get("/health")
      .set("x-request-id", requestId);

    expect(response.headers["x-request-id"]).toBe(requestId);
  });

  it("maps malformed JSON bodies to INVALID_JSON", async () => {
    const response = await request(app)
      .post("/health")
      .set("content-type", "application/json")
      .send('{"invalid":');
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON body",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns PAYLOAD_TOO_LARGE for oversized JSON bodies", async () => {
    const response = await request(app)
      .post("/health")
      .set("content-type", "application/json")
      .send({
        payload: "x".repeat(1_048_577),
      });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(413);
    expect(body).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body too large",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("applies a sentinel helmet header", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows configured CORS origins", async () => {
    const { app: configuredApp, close } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS:
        "https://app.techbros.test, https://admin.techbros.test",
    });
    const origin = "https://app.techbros.test";

    try {
      const response = await request(configuredApp)
        .get("/health")
        .set("origin", origin);

      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      await close();
    }
  });

  it("does not add CORS headers for non-allowlisted origins", async () => {
    const { app: configuredApp, close } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: "https://app.techbros.test",
    });

    try {
      const response = await request(configuredApp)
        .get("/health")
        .set("origin", "https://evil.techbros.test");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(
        response.headers["access-control-allow-credentials"],
      ).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("allows requests without an Origin header", async () => {
    const { app: configuredApp, close } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: "https://app.techbros.test",
    });

    try {
      const response = await request(configuredApp).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("returns 503 for GET /ready when the database is unreachable", async () => {
    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      checks: {
        database: "error",
      },
    });
  });
});

const loadApp = async () => {
  const { createApp } = await importFresh(() => import("../../src/app.js"));
  const { logger } = await import("../../src/lib/logger.js");

  logger.level = "silent";

  return createApp();
};

const loadDbClient = async () => import("../../src/db/client.js");

const loadAppWithEnv = async (
  overrides: Record<string, string | undefined>,
): Promise<{
  app: Awaited<ReturnType<typeof loadApp>>;
  close: () => Promise<void>;
}> => {
  const previousValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  const app = await loadApp();
  const { closePool } = await loadDbClient();

  return {
    app,
    close: async () => {
      await closePool();

      for (const [key, value] of previousValues) {
        if (value === undefined) {
          delete process.env[key];
          continue;
        }

        process.env[key] = value;
      }
    },
  };
};
