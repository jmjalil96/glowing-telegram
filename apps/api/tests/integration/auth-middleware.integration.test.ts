import express from "express";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { RequestAuth } from "../../src/auth/types.js";
import { logger } from "../../src/lib/logger.js";
import { errorHandlerMiddleware } from "../../src/middlewares/error-handler.js";
import { createLoadAuthMiddleware } from "../../src/middlewares/load-auth.js";
import { requestIdMiddleware } from "../../src/middlewares/request-id.js";
import { requireAuthMiddleware } from "../../src/middlewares/require-auth.js";

interface ApiErrorResponseBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

type ResolveRequestAuth = (
  rawSessionToken: string,
) => Promise<RequestAuth | null>;

const requestAuth: RequestAuth = {
  userId: "user-123",
  tenantId: "tenant-123",
  email: "hello@techbros.test",
  displayName: "Tech Bros",
  emailVerifiedAt: new Date("2025-12-31T00:00:00.000Z"),
  sessionId: "session-123",
};

describe("auth middleware integration", () => {
  beforeAll(() => {
    logger.level = "silent";
  });

  it("sets req.auth to null when no session cookie is present", async () => {
    const resolveRequestAuth = vi.fn<ResolveRequestAuth>();
    const app = createLoadAuthTestApp(resolveRequestAuth);

    const response = await request(app).get("/auth-context");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: null,
    });
    expect(resolveRequestAuth).not.toHaveBeenCalled();
  });

  it("hydrates req.auth when a valid session cookie is present", async () => {
    const resolveRequestAuth = vi
      .fn<ResolveRequestAuth>()
      .mockResolvedValue(requestAuth);
    const app = createLoadAuthTestApp(resolveRequestAuth);

    const response = await request(app)
      .get("/auth-context")
      .set("cookie", "techbros_session=raw-session-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: {
        ...requestAuth,
        emailVerifiedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    expect(resolveRequestAuth).toHaveBeenCalledWith("raw-session-token");
  });

  it("ignores invalid session cookies and continues", async () => {
    const resolveRequestAuth = vi
      .fn<ResolveRequestAuth>()
      .mockResolvedValue(null);
    const app = createLoadAuthTestApp(resolveRequestAuth);

    const response = await request(app)
      .get("/auth-context")
      .set("cookie", "techbros_session=raw-session-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: null,
    });
    expect(resolveRequestAuth).toHaveBeenCalledWith("raw-session-token");
  });

  it("ignores malformed cookie headers", async () => {
    const resolveRequestAuth = vi.fn<ResolveRequestAuth>();
    const app = createLoadAuthTestApp(resolveRequestAuth);

    const response = await request(app)
      .get("/auth-context")
      .set("cookie", "broken-cookie; another-bad-segment");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: null,
    });
    expect(resolveRequestAuth).not.toHaveBeenCalled();
  });

  it("surfaces resolver failures to the error handler", async () => {
    const resolveRequestAuth = vi
      .fn<ResolveRequestAuth>()
      .mockRejectedValue(new Error("database unavailable"));
    const app = createLoadAuthTestApp(resolveRequestAuth);

    const response = await request(app)
      .get("/auth-context")
      .set("cookie", "techbros_session=raw-session-token");
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns 401 when req.auth is absent", async () => {
    const app = createRequireAuthTestApp(null);

    const response = await request(app).get("/protected");
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("allows the request through when req.auth is present", async () => {
    const app = createRequireAuthTestApp(requestAuth);

    const response = await request(app).get("/protected");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      auth: {
        ...requestAuth,
        emailVerifiedAt: "2025-12-31T00:00:00.000Z",
      },
    });
  });
});

const applyCommonMiddleware = (app: express.Express): void => {
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
      customProps: (req) => ({
        requestId: req.requestId,
      }),
    }),
  );
};

const createLoadAuthTestApp = (
  resolveRequestAuth: ResolveRequestAuth,
): express.Express => {
  const app = express();

  applyCommonMiddleware(app);
  app.use(
    createLoadAuthMiddleware({
      sessionAuthService: {
        resolveRequestAuth,
      },
    }),
  );
  app.get("/auth-context", (req, res) => {
    res.status(200).json({
      auth: req.auth ?? null,
    });
  });
  app.use(errorHandlerMiddleware);

  return app;
};

const createRequireAuthTestApp = (
  auth: RequestAuth | null,
): express.Express => {
  const app = express();

  applyCommonMiddleware(app);
  app.use((req, _res, next) => {
    req.auth = auth;
    next();
  });
  app.get("/protected", requireAuthMiddleware, (req, res) => {
    res.status(200).json({
      ok: true,
      auth: req.auth,
    });
  });
  app.use(errorHandlerMiddleware);

  return app;
};
