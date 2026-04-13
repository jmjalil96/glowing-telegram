import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import express from "express";
import { pinoHttp } from "pino-http";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { runMigrations, truncateTables } from "../helpers/database.js";
import { importFresh, resetModuleGraph } from "../helpers/module.js";

interface ApiErrorResponseBody {
  error: {
    code: string;
    message: string;
    details: Array<{
      source: string;
      path: string;
      message: string;
      code: string;
    }>;
    requestId: string;
  };
}

interface AuthenticatedUserResponseBody {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
  };
}

interface AuthContextResponseBody {
  auth: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
    sessionId: string;
  } | null;
}

describe("auth login integration", () => {
  const defaultDatabaseUrl = process.env.DATABASE_URL;

  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | null =
    null;
  let app: express.Express;
  let createApp: Awaited<ReturnType<typeof loadAppModule>>["createApp"];
  let passwordHasher: Awaited<
    ReturnType<typeof loadPasswordHasherModule>
  >["passwordHasher"];
  let opaqueTokenService: Awaited<
    ReturnType<typeof loadOpaqueTokenModule>
  >["opaqueTokenService"];
  let loadAuthMiddleware: Awaited<
    ReturnType<typeof loadAuthMiddlewareModule>
  >["loadAuthMiddleware"];
  let emailService: Awaited<
    ReturnType<typeof loadEmailServiceModule>
  >["emailService"];
  let errorHandlerMiddleware: Awaited<
    ReturnType<typeof loadErrorHandlerModule>
  >["errorHandlerMiddleware"];
  let requestIdMiddleware: Awaited<
    ReturnType<typeof loadRequestIdModule>
  >["requestIdMiddleware"];
  let logger: Awaited<ReturnType<typeof loadLoggerModule>>["logger"];
  let pool: Awaited<ReturnType<typeof loadDbClient>>["pool"];
  let db: Awaited<ReturnType<typeof loadDbClient>>["db"];
  let closePool: Awaited<ReturnType<typeof loadDbClient>>["closePool"] | null =
    null;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17")
      .withDatabase("techbros_api_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    resetModuleGraph();

    ({ createApp } = await importFresh(loadAppModule));
    ({ pool, db, closePool } = await loadDbClient());
    ({ passwordHasher } = await loadPasswordHasherModule());
    ({ opaqueTokenService } = await loadOpaqueTokenModule());
    ({ loadAuthMiddleware } = await loadAuthMiddlewareModule());
    ({ emailService } = await loadEmailServiceModule());
    ({ errorHandlerMiddleware } = await loadErrorHandlerModule());
    ({ requestIdMiddleware } = await loadRequestIdModule());
    ({ logger } = await loadLoggerModule());

    await runMigrations(db);
    logger.level = "silent";
    app = createApp();
  });

  beforeEach(async () => {
    await truncateTables(pool, [
      "audit_logs",
      "sessions",
      "user_tokens",
      "users",
      "tenants",
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool?.();
    await container?.stop();

    if (defaultDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = defaultDatabaseUrl;
    }

    resetModuleGraph();
  });

  it("returns VALIDATION_ERROR for invalid login payloads", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "not-an-email",
      password: "",
    });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "body",
          path: "email",
        }),
        expect.objectContaining({
          source: "body",
          path: "password",
        }),
      ]),
    );
  });

  it("logs in a verified active user, sets the session cookie, records audit, and creates a loadable session", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-alpha",
      name: "Tenant Alpha",
    });
    await seedUser({
      userId,
      tenantId,
      email: "hello@techbros.test",
      passwordHash,
      displayName: "Tech Bros",
      emailVerifiedAt,
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: " HELLO@TECHBROS.TEST ",
      password,
    });

    expect(response.status).toBe(200);
    const body = response.body as AuthenticatedUserResponseBody;

    expect(body).toEqual({
      user: {
        userId,
        tenantId,
        email: "hello@techbros.test",
        displayName: "Tech Bros",
        emailVerifiedAt: emailVerifiedAt.toISOString(),
      },
    });

    const setCookie = normalizeSetCookieHeader(response.headers["set-cookie"]);

    expect(setCookie).toEqual(expect.any(Array));
    expect(setCookie[0]).toContain("techbros_session=");
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("Path=/");
    expect(setCookie[0]).toContain("SameSite=Lax");
    expect(setCookie[0]).not.toContain("Secure");

    const sessionToken = extractCookieValue(setCookie, "techbros_session");
    const authContextApp = createAuthContextApp();
    const authContextResponse = await request(authContextApp)
      .get("/auth-context")
      .set("cookie", `techbros_session=${sessionToken}`);
    const authContextBody = authContextResponse.body as AuthContextResponseBody;

    expect(authContextResponse.status).toBe(200);
    const resolvedAuth = authContextBody.auth;

    if (!resolvedAuth) {
      throw new Error("Expected auth context to be resolved");
    }

    expect(resolvedAuth.userId).toBe(userId);
    expect(resolvedAuth.tenantId).toBe(tenantId);
    expect(resolvedAuth.email).toBe("hello@techbros.test");
    expect(resolvedAuth.displayName).toBe("Tech Bros");
    expect(resolvedAuth.emailVerifiedAt).toBe(emailVerifiedAt.toISOString());
    expect(resolvedAuth.sessionId).toEqual(expect.any(String));

    const sessionResult = await pool.query<{
      user_id: string;
      token_hash: string;
      revoked_at: string | null;
    }>(
      `select user_id, token_hash, revoked_at
       from sessions`,
    );

    expect(sessionResult.rows).toHaveLength(1);
    const sessionRow = sessionResult.rows[0];

    if (!sessionRow) {
      throw new Error("Expected session row");
    }

    expect(sessionRow.user_id).toBe(userId);
    expect(sessionRow.revoked_at).toBeNull();
    expect(sessionRow.token_hash).toEqual(expect.any(String));
    expect(sessionRow.token_hash).not.toBe(sessionToken);

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, request_id, metadata
       from audit_logs
       order by created_at asc`,
    );

    expect(auditResult.rows).toHaveLength(1);
    const successAuditRow = auditResult.rows[0];

    if (!successAuditRow) {
      throw new Error("Expected success audit row");
    }

    expect(successAuditRow.action).toBe("auth.login.succeeded");
    expect(successAuditRow.tenant_id).toBe(tenantId);
    expect(successAuditRow.actor_user_id).toBe(userId);
    expect(successAuditRow.target_type).toBe("user");
    expect(successAuditRow.target_id).toBe(userId);
    expect(successAuditRow.request_id).toBe(response.headers["x-request-id"]);
    expect(successAuditRow.metadata).toEqual({
      method: "password",
      sessionId: resolvedAuth.sessionId,
    });
  });

  it("returns 401 for GET /api/v1/auth/me when no session cookie is present", async () => {
    const response = await request(app).get("/api/v1/auth/me");
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

  it("returns 401 for POST /api/v1/auth/logout when no session cookie is present", async () => {
    const response = await request(app).post("/api/v1/auth/logout");
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

  it("returns 401 for GET /api/v1/auth/me when the session cookie is invalid", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", "techbros_session=invalid-session-token");
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

  it("returns 401 for POST /api/v1/auth/logout when the session cookie is invalid", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("cookie", "techbros_session=invalid-session-token");
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

  it("returns 401 for GET /api/v1/auth/me when the session is revoked", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-epsilon",
      name: "Tenant Epsilon",
    });
    await seedUser({
      userId,
      tenantId,
      email: "revoked@techbros.test",
      passwordHash,
      displayName: "Revoked User",
      emailVerifiedAt,
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "revoked@techbros.test",
      password,
    });
    const sessionToken = extractCookieValue(
      normalizeSetCookieHeader(loginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    await pool.query("update sessions set revoked_at = now()");

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", `techbros_session=${sessionToken}`);
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

  it("returns 401 for GET /api/v1/auth/me when the session is expired", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-zeta",
      name: "Tenant Zeta",
    });
    await seedUser({
      userId,
      tenantId,
      email: "expired@techbros.test",
      passwordHash,
      displayName: "Expired User",
      emailVerifiedAt,
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "expired@techbros.test",
      password,
    });
    const sessionToken = extractCookieValue(
      normalizeSetCookieHeader(loginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    await pool.query("update sessions set expires_at = $1", [
      new Date("2020-01-01T00:00:00.000Z"),
    ]);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", `techbros_session=${sessionToken}`);
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

  it("returns the authenticated user for GET /api/v1/auth/me and matches the login response without exposing sessionId", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-eta",
      name: "Tenant Eta",
    });
    await seedUser({
      userId,
      tenantId,
      email: "me@techbros.test",
      passwordHash,
      displayName: "Me User",
      emailVerifiedAt,
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "me@techbros.test",
      password,
    });
    const loginBody = loginResponse.body as AuthenticatedUserResponseBody;
    const sessionToken = extractCookieValue(
      normalizeSetCookieHeader(loginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", `techbros_session=${sessionToken}`);
    const body = response.body as AuthenticatedUserResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual(loginBody);
    expect(body.user).not.toHaveProperty("sessionId");
  });

  it("logs out the current session, clears the cookie, records audit, and makes /me return 401 for that cookie", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-theta",
      name: "Tenant Theta",
    });
    await seedUser({
      userId,
      tenantId,
      email: "logout@techbros.test",
      passwordHash,
      displayName: "Logout User",
      emailVerifiedAt,
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "logout@techbros.test",
      password,
    });
    const sessionToken = extractCookieValue(
      normalizeSetCookieHeader(loginResponse.headers["set-cookie"]),
      "techbros_session",
    );
    const loginSessionResult = await pool.query<{
      id: string;
    }>("select id from sessions");
    const loginSession = loginSessionResult.rows[0];

    if (!loginSession) {
      throw new Error("Expected login session row");
    }

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("cookie", `techbros_session=${sessionToken}`);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({
      success: true,
    });

    const logoutSetCookie = normalizeSetCookieHeader(
      logoutResponse.headers["set-cookie"],
    );

    expect(logoutSetCookie).toHaveLength(1);
    expect(logoutSetCookie[0]).toContain("techbros_session=");
    expect(logoutSetCookie[0]).toContain("HttpOnly");
    expect(logoutSetCookie[0]).toContain("Path=/");
    expect(logoutSetCookie[0]).toContain("SameSite=Lax");
    expect(logoutSetCookie[0]).toContain("Expires=");

    const revokedSessionResult = await pool.query<{
      id: string;
      revoked_at: string | null;
    }>(
      `select id, revoked_at
       from sessions`,
    );

    expect(revokedSessionResult.rows).toHaveLength(1);
    const revokedSession = revokedSessionResult.rows[0];

    if (!revokedSession) {
      throw new Error("Expected revoked session row");
    }

    expect(revokedSession.id).toBe(loginSession.id);
    expect(revokedSession.revoked_at).toBeInstanceOf(Date);

    const meAfterLogoutResponse = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", `techbros_session=${sessionToken}`);
    const meAfterLogoutBody =
      meAfterLogoutResponse.body as ApiErrorResponseBody;

    expect(meAfterLogoutResponse.status).toBe(401);
    expect(meAfterLogoutBody).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        details: [],
        requestId: meAfterLogoutResponse.headers["x-request-id"],
      },
    });

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, request_id, metadata
       from audit_logs
       order by created_at asc`,
    );

    expect(auditResult.rows).toHaveLength(2);
    const logoutAuditRow = auditResult.rows[1];

    if (!logoutAuditRow) {
      throw new Error("Expected logout audit row");
    }

    expect(logoutAuditRow.action).toBe("auth.logout.succeeded");
    expect(logoutAuditRow.tenant_id).toBe(tenantId);
    expect(logoutAuditRow.actor_user_id).toBe(userId);
    expect(logoutAuditRow.target_type).toBe("user");
    expect(logoutAuditRow.target_id).toBe(userId);
    expect(logoutAuditRow.request_id).toBe(
      logoutResponse.headers["x-request-id"],
    );
    expect(logoutAuditRow.metadata).toEqual({
      sessionId: loginSession.id,
    });
  });

  it("logs out only the current session and leaves another active session usable", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-iota",
      name: "Tenant Iota",
    });
    await seedUser({
      userId,
      tenantId,
      email: "multi-session@techbros.test",
      passwordHash,
      displayName: "Multi Session User",
      emailVerifiedAt,
    });

    const firstLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "multi-session@techbros.test",
        password,
      });
    const firstSessionToken = extractCookieValue(
      normalizeSetCookieHeader(firstLoginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    const secondLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("cookie", `techbros_session=${firstSessionToken}`)
      .send({
        email: "multi-session@techbros.test",
        password,
      });
    const secondSessionToken = extractCookieValue(
      normalizeSetCookieHeader(secondLoginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    const sessionsBeforeLogout = await pool.query<{
      id: string;
      revoked_at: string | null;
    }>(
      `select id, revoked_at
       from sessions
       order by created_at asc`,
    );

    expect(sessionsBeforeLogout.rows).toHaveLength(2);
    expect(sessionsBeforeLogout.rows[0]?.revoked_at).not.toBeNull();
    expect(sessionsBeforeLogout.rows[1]?.revoked_at).toBeNull();

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("cookie", `techbros_session=${secondSessionToken}`);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({
      success: true,
    });

    const sessionsAfterLogout = await pool.query<{
      id: string;
      revoked_at: string | null;
    }>(
      `select id, revoked_at
       from sessions
       order by created_at asc`,
    );

    expect(sessionsAfterLogout.rows).toHaveLength(2);
    expect(sessionsAfterLogout.rows[0]?.revoked_at).not.toBeNull();
    expect(sessionsAfterLogout.rows[1]?.revoked_at).not.toBeNull();
  });

  it("returns ACCOUNT_NOT_FOUND and records a failed login audit row", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "missing@techbros.test",
      password: "correct horse battery staple",
    });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "ACCOUNT_NOT_FOUND",
        message: "Account not found",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, request_id, metadata
       from audit_logs`,
    );

    expect(auditResult.rows).toEqual([
      {
        action: "auth.login.failed",
        tenant_id: null,
        actor_user_id: null,
        target_type: null,
        target_id: null,
        request_id: response.headers["x-request-id"],
        metadata: {
          method: "password",
          reason: "account_not_found",
        },
      },
    ]);
  });

  it("returns EMAIL_NOT_VERIFIED for known users and records a failed audit row with actor context", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);

    await seedTenant({
      tenantId,
      slug: "tenant-beta",
      name: "Tenant Beta",
    });
    await seedUser({
      userId,
      tenantId,
      email: "pending@techbros.test",
      passwordHash,
      displayName: "Pending User",
      emailVerifiedAt: null,
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "pending@techbros.test",
      password,
    });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Email is not verified",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, metadata
       from audit_logs`,
    );

    expect(auditResult.rows).toEqual([
      {
        action: "auth.login.failed",
        tenant_id: tenantId,
        actor_user_id: userId,
        target_type: "user",
        target_id: userId,
        metadata: {
          method: "password",
          reason: "email_not_verified",
        },
      },
    ]);
  });

  it("returns ACCOUNT_INACTIVE for inactive users and records a failed audit row with actor context", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-gamma",
      name: "Tenant Gamma",
    });
    await seedUser({
      userId,
      tenantId,
      email: "inactive@techbros.test",
      passwordHash,
      displayName: "Inactive User",
      emailVerifiedAt,
      isActive: false,
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "inactive@techbros.test",
      password,
    });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: {
        code: "ACCOUNT_INACTIVE",
        message: "Account is inactive",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, metadata
       from audit_logs`,
    );

    expect(auditResult.rows).toEqual([
      {
        action: "auth.login.failed",
        tenant_id: tenantId,
        actor_user_id: userId,
        target_type: "user",
        target_id: userId,
        metadata: {
          method: "password",
          reason: "account_inactive",
        },
      },
    ]);
  });

  it("returns INVALID_PASSWORD for known users with the wrong password and records a failed audit row", async () => {
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-delta",
      name: "Tenant Delta",
    });
    await seedUser({
      userId,
      tenantId,
      email: "wrong-password@techbros.test",
      passwordHash,
      displayName: "Wrong Password User",
      emailVerifiedAt,
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "wrong-password@techbros.test",
      password: "not-the-right-password",
    });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "INVALID_PASSWORD",
        message: "Invalid password",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });

    const sessionResult = await pool.query<{
      id: string;
    }>("select id from sessions");

    expect(sessionResult.rows).toEqual([]);

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, metadata
       from audit_logs`,
    );

    expect(auditResult.rows).toEqual([
      {
        action: "auth.login.failed",
        tenant_id: tenantId,
        actor_user_id: userId,
        target_type: "user",
        target_id: userId,
        metadata: {
          method: "password",
          reason: "invalid_password",
        },
      },
    ]);
  });

  it("returns VALIDATION_ERROR for invalid forgot-password payloads", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "not-an-email",
      });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "body",
          path: "email",
        }),
      ]),
    );
  });

  it("returns success for forgot-password, issues a reset token, sends email, and records audit for active users", async () => {
    const sendEmailSpy = vi.spyOn(emailService, "send").mockResolvedValue({
      messageId: "password-reset-1",
      accepted: ["forgot@techbros.test"],
      rejected: [],
      response: "250 queued",
    });
    const password = "correct horse battery staple";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(password);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-kappa",
      name: "Tenant Kappa",
    });
    await seedUser({
      userId,
      tenantId,
      email: "forgot@techbros.test",
      passwordHash,
      displayName: "Forgot User",
      emailVerifiedAt,
    });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: " FORGOT@TECHBROS.TEST ",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    const emailMessage = sendEmailSpy.mock.calls[0]?.[0];

    if (!emailMessage) {
      throw new Error("Expected password reset email to be sent");
    }

    expect(emailMessage.to).toBe("forgot@techbros.test");
    expect(emailMessage.subject).toContain("Reset your Tech Bros password");
    expect(emailMessage.text).toContain(
      "http://localhost:5173/reset-password?token=",
    );
    expect(emailMessage.html).toContain(
      "http://localhost:5173/reset-password?token=",
    );

    const resetToken = extractPasswordResetTokenFromEmailMessage(emailMessage);
    const tokenResult = await pool.query<{
      user_id: string;
      token_hash: string;
      type: string;
      used_at: Date | null;
    }>(
      `select user_id, token_hash, type, used_at
       from user_tokens`,
    );

    expect(tokenResult.rows).toHaveLength(1);
    const tokenRow = tokenResult.rows[0];

    if (!tokenRow) {
      throw new Error("Expected password reset token row");
    }

    expect(tokenRow.user_id).toBe(userId);
    expect(tokenRow.type).toBe("password_reset");
    expect(tokenRow.used_at).toBeNull();
    expect(tokenRow.token_hash).toBe(opaqueTokenService.hash(resetToken));
    expect(tokenRow.token_hash).not.toBe(resetToken);

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, request_id, metadata
       from audit_logs`,
    );

    expect(auditResult.rows).toEqual([
      {
        action: "auth.password-reset.requested",
        tenant_id: tenantId,
        actor_user_id: userId,
        target_type: "user",
        target_id: userId,
        request_id: response.headers["x-request-id"],
        metadata: {},
      },
    ]);
  });

  it("returns generic success for forgot-password when the account does not exist", async () => {
    const sendEmailSpy = vi.spyOn(emailService, "send").mockResolvedValue({
      messageId: "password-reset-missing",
      accepted: [],
      rejected: [],
      response: "250 queued",
    });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "missing-forgot@techbros.test",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });
    expect(sendEmailSpy).not.toHaveBeenCalled();

    const tokenResult = await pool.query("select id from user_tokens");
    const auditResult = await pool.query("select id from audit_logs");

    expect(tokenResult.rows).toEqual([]);
    expect(auditResult.rows).toEqual([]);
  });

  it("returns generic success for forgot-password when the account is inactive", async () => {
    const sendEmailSpy = vi.spyOn(emailService, "send").mockResolvedValue({
      messageId: "password-reset-inactive",
      accepted: [],
      rejected: [],
      response: "250 queued",
    });
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-lambda",
      name: "Tenant Lambda",
    });
    await seedUser({
      userId,
      tenantId,
      email: "inactive-forgot@techbros.test",
      passwordHash,
      displayName: "Inactive Forgot User",
      emailVerifiedAt,
      isActive: false,
    });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "inactive-forgot@techbros.test",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });
    expect(sendEmailSpy).not.toHaveBeenCalled();

    const tokenResult = await pool.query("select id from user_tokens");
    const auditResult = await pool.query("select id from audit_logs");

    expect(tokenResult.rows).toEqual([]);
    expect(auditResult.rows).toEqual([]);
  });

  it("invalidates previous password reset tokens when forgot-password is requested again", async () => {
    const sendEmailSpy = vi.spyOn(emailService, "send").mockResolvedValue({
      messageId: "password-reset-rotate",
      accepted: ["rotate@techbros.test"],
      rejected: [],
      response: "250 queued",
    });
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-mu",
      name: "Tenant Mu",
    });
    await seedUser({
      userId,
      tenantId,
      email: "rotate@techbros.test",
      passwordHash,
      displayName: "Rotate User",
      emailVerifiedAt,
    });

    const firstResponse = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "rotate@techbros.test",
      });
    const secondResponse = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "rotate@techbros.test",
      });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(2);

    const firstMessage = sendEmailSpy.mock.calls[0]?.[0];
    const secondMessage = sendEmailSpy.mock.calls[1]?.[0];

    if (!firstMessage || !secondMessage) {
      throw new Error("Expected password reset emails for both requests");
    }

    const firstToken = extractPasswordResetTokenFromEmailMessage(firstMessage);
    const secondToken =
      extractPasswordResetTokenFromEmailMessage(secondMessage);

    expect(firstToken).not.toBe(secondToken);

    const tokenResult = await pool.query<{
      token_hash: string;
      used_at: Date | null;
    }>(
      `select token_hash, used_at
       from user_tokens
       order by created_at asc`,
    );

    expect(tokenResult.rows).toHaveLength(2);
    expect(tokenResult.rows[0]?.token_hash).toBe(
      opaqueTokenService.hash(firstToken),
    );
    expect(tokenResult.rows[0]?.used_at).toBeInstanceOf(Date);
    expect(tokenResult.rows[1]?.token_hash).toBe(
      opaqueTokenService.hash(secondToken),
    );
    expect(tokenResult.rows[1]?.used_at).toBeNull();

    const firstResetResponse = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: firstToken,
        password: "new password that should not work",
      });
    const secondResetResponse = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: secondToken,
        password: "new password that should work",
      });

    expect(firstResetResponse.status).toBe(400);
    expect(firstResetResponse.body).toEqual({
      error: {
        code: "INVALID_RESET_TOKEN",
        message: "Invalid or expired reset token",
        details: [],
        requestId: firstResetResponse.headers["x-request-id"],
      },
    });
    expect(secondResetResponse.status).toBe(200);
    expect(secondResetResponse.body).toEqual({
      success: true,
    });
  });

  it("returns generic success for forgot-password when email delivery fails and invalidates the issued token", async () => {
    vi.spyOn(emailService, "send").mockRejectedValue(new Error("smtp offline"));
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-nu",
      name: "Tenant Nu",
    });
    await seedUser({
      userId,
      tenantId,
      email: "delivery-failure@techbros.test",
      passwordHash,
      displayName: "Delivery Failure User",
      emailVerifiedAt,
    });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({
        email: "delivery-failure@techbros.test",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });

    const tokenResult = await pool.query<{
      used_at: Date | null;
    }>(
      `select used_at
       from user_tokens`,
    );
    const auditResult = await pool.query("select id from audit_logs");

    expect(tokenResult.rows).toHaveLength(1);
    expect(tokenResult.rows[0]?.used_at).toBeInstanceOf(Date);
    expect(auditResult.rows).toEqual([]);
  });

  it("returns VALIDATION_ERROR for invalid reset-password payloads", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: "   ",
        password: "short",
      });
    const body = response.body as ApiErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "body",
          path: "token",
        }),
        expect.objectContaining({
          source: "body",
          path: "password",
        }),
      ]),
    );
  });

  it("returns INVALID_RESET_TOKEN for unknown reset tokens", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: "not-a-real-reset-token",
        password: "new valid password",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_RESET_TOKEN",
        message: "Invalid or expired reset token",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns INVALID_RESET_TOKEN for used reset tokens", async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-xi",
      name: "Tenant Xi",
    });
    await seedUser({
      userId,
      tenantId,
      email: "used-token@techbros.test",
      passwordHash,
      displayName: "Used Token User",
      emailVerifiedAt,
    });

    const rawToken = "used-reset-token";
    await seedPasswordResetToken({
      userId,
      rawToken,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      usedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: rawToken,
        password: "new valid password",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_RESET_TOKEN",
        message: "Invalid or expired reset token",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns INVALID_RESET_TOKEN for expired reset tokens", async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-omicron",
      name: "Tenant Omicron",
    });
    await seedUser({
      userId,
      tenantId,
      email: "expired-token@techbros.test",
      passwordHash,
      displayName: "Expired Token User",
      emailVerifiedAt,
    });

    const rawToken = "expired-reset-token";
    await seedPasswordResetToken({
      userId,
      rawToken,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: rawToken,
        password: "new valid password",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_RESET_TOKEN",
        message: "Invalid or expired reset token",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns ACCOUNT_INACTIVE for valid reset tokens linked to inactive users", async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(
      "correct horse battery staple",
    );
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-pi",
      name: "Tenant Pi",
    });
    await seedUser({
      userId,
      tenantId,
      email: "inactive-reset@techbros.test",
      passwordHash,
      displayName: "Inactive Reset User",
      emailVerifiedAt,
      isActive: false,
    });

    await seedPasswordResetToken({
      userId,
      rawToken: "inactive-reset-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: "inactive-reset-token",
        password: "new valid password",
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "ACCOUNT_INACTIVE",
        message: "Account is inactive",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("resets the password, invalidates sibling reset tokens, revokes all sessions, clears the cookie, and records audit", async () => {
    const oldPassword = "correct horse battery staple";
    const newPassword = "this is the new password";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(oldPassword);
    const emailVerifiedAt = new Date("2025-12-31T00:00:00.000Z");

    await seedTenant({
      tenantId,
      slug: "tenant-rho",
      name: "Tenant Rho",
    });
    await seedUser({
      userId,
      tenantId,
      email: "reset-success@techbros.test",
      passwordHash,
      displayName: "Reset Success User",
      emailVerifiedAt,
    });

    const firstLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset-success@techbros.test",
        password: oldPassword,
      });
    const secondLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset-success@techbros.test",
        password: oldPassword,
      });
    const firstSessionToken = extractCookieValue(
      normalizeSetCookieHeader(firstLoginResponse.headers["set-cookie"]),
      "techbros_session",
    );

    await seedPasswordResetToken({
      userId,
      rawToken: "reset-success-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await seedPasswordResetToken({
      userId,
      rawToken: "reset-sibling-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .set("cookie", `techbros_session=${firstSessionToken}`)
      .send({
        token: "reset-success-token",
        password: newPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });

    const setCookie = normalizeSetCookieHeader(response.headers["set-cookie"]);

    expect(setCookie).toHaveLength(1);
    expect(setCookie[0]).toContain("techbros_session=");
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("Path=/");
    expect(setCookie[0]).toContain("SameSite=Lax");
    expect(setCookie[0]).toContain("Expires=");

    const tokenResult = await pool.query<{
      token_hash: string;
      used_at: Date | null;
    }>(
      `select token_hash, used_at
       from user_tokens
       order by created_at asc`,
    );

    expect(tokenResult.rows).toHaveLength(2);
    expect(tokenResult.rows[0]?.used_at).toBeInstanceOf(Date);
    expect(tokenResult.rows[1]?.used_at).toBeInstanceOf(Date);

    const sessionResult = await pool.query<{
      revoked_at: Date | null;
    }>(
      `select revoked_at
       from sessions
       order by created_at asc`,
    );

    expect(sessionResult.rows).toHaveLength(2);
    expect(sessionResult.rows[0]?.revoked_at).toBeInstanceOf(Date);
    expect(sessionResult.rows[1]?.revoked_at).toBeInstanceOf(Date);

    const meAfterResetResponse = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", `techbros_session=${firstSessionToken}`);

    expect(meAfterResetResponse.status).toBe(401);

    const oldPasswordLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset-success@techbros.test",
        password: oldPassword,
      });
    const newPasswordLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset-success@techbros.test",
        password: newPassword,
      });

    expect(oldPasswordLoginResponse.status).toBe(401);
    expect(oldPasswordLoginResponse.body).toEqual({
      error: {
        code: "INVALID_PASSWORD",
        message: "Invalid password",
        details: [],
        requestId: oldPasswordLoginResponse.headers["x-request-id"],
      },
    });
    expect(newPasswordLoginResponse.status).toBe(200);

    const auditResult = await pool.query<{
      action: string;
      tenant_id: string | null;
      actor_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, tenant_id, actor_user_id, target_type, target_id, request_id, metadata
       from audit_logs
       order by created_at asc`,
    );
    const resetAuditRow = auditResult.rows.find(
      (row) => row.action === "auth.password-reset.completed",
    );

    if (!resetAuditRow) {
      throw new Error("Expected password reset completion audit row");
    }

    expect(resetAuditRow).toEqual({
      action: "auth.password-reset.completed",
      tenant_id: tenantId,
      actor_user_id: userId,
      target_type: "user",
      target_id: userId,
      request_id: response.headers["x-request-id"],
      metadata: {},
    });

    const sessionsAfterNewLogin = await pool.query<{
      revoked_at: Date | null;
    }>(
      `select revoked_at
       from sessions
       order by created_at asc`,
    );

    expect(sessionsAfterNewLogin.rows).toHaveLength(3);
    expect(sessionsAfterNewLogin.rows[0]?.revoked_at).toBeInstanceOf(Date);
    expect(sessionsAfterNewLogin.rows[1]?.revoked_at).toBeInstanceOf(Date);
    expect(sessionsAfterNewLogin.rows[2]?.revoked_at).toBeNull();
    expect(secondLoginResponse.status).toBe(200);
  });

  it("marks email as verified on successful reset and allows the new password to log in", async () => {
    const oldPassword = "correct horse battery staple";
    const newPassword = "verified through reset";
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await passwordHasher.hash(oldPassword);

    await seedTenant({
      tenantId,
      slug: "tenant-sigma",
      name: "Tenant Sigma",
    });
    await seedUser({
      userId,
      tenantId,
      email: "verify-on-reset@techbros.test",
      passwordHash,
      displayName: "Verify On Reset User",
      emailVerifiedAt: null,
    });

    await seedPasswordResetToken({
      userId,
      rawToken: "verify-on-reset-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: "verify-on-reset-token",
        password: newPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });

    const userResult = await pool.query<{
      email_verified_at: Date | null;
    }>(
      `select email_verified_at
       from users
       where id = $1`,
      [userId],
    );

    expect(userResult.rows[0]?.email_verified_at).toBeInstanceOf(Date);

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "verify-on-reset@techbros.test",
      password: newPassword,
    });

    expect(loginResponse.status).toBe(200);
  });

  const seedTenant = async ({
    tenantId,
    slug,
    name,
  }: {
    tenantId: string;
    slug: string;
    name: string;
  }): Promise<void> => {
    await pool.query(
      "insert into tenants (id, slug, name) values ($1, $2, $3)",
      [tenantId, slug, name],
    );
  };

  const seedUser = async ({
    userId,
    tenantId,
    email,
    passwordHash,
    displayName,
    emailVerifiedAt,
    isActive = true,
  }: {
    userId: string;
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    emailVerifiedAt: Date | null;
    isActive?: boolean;
  }): Promise<void> => {
    await pool.query(
      `insert into users (id, tenant_id, email, password_hash, display_name, email_verified_at, is_active)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        tenantId,
        email,
        passwordHash,
        displayName,
        emailVerifiedAt,
        isActive,
      ],
    );
  };

  const seedPasswordResetToken = async ({
    userId,
    rawToken,
    expiresAt,
    usedAt = null,
  }: {
    userId: string;
    rawToken: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<void> => {
    await pool.query(
      `insert into user_tokens (id, user_id, token_hash, type, expires_at, used_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        userId,
        opaqueTokenService.hash(rawToken),
        "password_reset",
        expiresAt,
        usedAt,
      ],
    );
  };

  const createAuthContextApp = (): express.Express => {
    const authContextApp = express();

    authContextApp.use(requestIdMiddleware);
    authContextApp.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.requestId,
        customProps: (req) => ({
          requestId: req.requestId,
        }),
      }),
    );
    authContextApp.use(loadAuthMiddleware);
    authContextApp.get("/auth-context", (req, res) => {
      res.status(200).json({
        auth: req.auth ?? null,
      });
    });
    authContextApp.use(errorHandlerMiddleware);

    return authContextApp;
  };
});

const extractCookieValue = (
  setCookieHeader: string[],
  cookieName: string,
): string => {
  const cookieHeader = setCookieHeader.find((value) =>
    value.startsWith(`${cookieName}=`),
  );

  if (!cookieHeader) {
    throw new Error(`Missing ${cookieName} cookie`);
  }

  const cookieValue = cookieHeader.split(";")[0]?.split("=")[1];

  if (!cookieValue) {
    throw new Error(`Missing ${cookieName} cookie value`);
  }

  return cookieValue;
};

const extractPasswordResetTokenFromEmailMessage = (message: {
  text?: string;
  html?: string;
}): string => {
  const emailContent = [message.text ?? "", message.html ?? ""].join("\n");
  const urlMatch = emailContent.match(/https?:\/\/[^\s"'<]+/);

  if (!urlMatch) {
    throw new Error("Missing reset password URL in email");
  }

  const resetUrl = new URL(urlMatch[0]);
  const token = resetUrl.searchParams.get("token");

  if (!token) {
    throw new Error("Missing reset token in email URL");
  }

  return token;
};

const normalizeSetCookieHeader = (
  rawSetCookie: string[] | string | undefined,
): string[] =>
  Array.isArray(rawSetCookie)
    ? rawSetCookie
    : rawSetCookie
      ? [rawSetCookie]
      : [];

const loadAppModule = async () => import("../../src/app.js");

const loadDbClient = async () => import("../../src/db/client.js");

const loadPasswordHasherModule = async () =>
  import("../../src/auth/lib/password-hasher.js");

const loadOpaqueTokenModule = async () =>
  import("../../src/auth/lib/opaque-token.js");

const loadAuthMiddlewareModule = async () =>
  import("../../src/middlewares/load-auth.js");

const loadEmailServiceModule = async () =>
  import("../../src/services/email/index.js");

const loadErrorHandlerModule = async () =>
  import("../../src/middlewares/error-handler.js");

const loadRequestIdModule = async () =>
  import("../../src/middlewares/request-id.js");

const loadLoggerModule = async () => import("../../src/lib/logger.js");
