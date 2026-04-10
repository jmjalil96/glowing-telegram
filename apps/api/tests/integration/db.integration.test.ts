import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations, truncateTables } from "../helpers/database.js";
import { resetModuleGraph } from "../helpers/module.js";

describe("database integration", () => {
  const defaultDatabaseUrl = process.env.DATABASE_URL;

  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | null =
    null;
  let app: Express;
  let createApp: Awaited<ReturnType<typeof loadAppModule>>["createApp"];
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

    ({ createApp } = await loadAppModule());
    ({ pool, db, closePool } = await loadDbClient());
    const { logger } = await import("../../src/lib/logger.js");

    await runMigrations(db);
    logger.level = "silent";
    app = createApp();
  });

  beforeEach(async () => {
    await truncateTables(pool, ["users"]);
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

  it("creates the users table through migrations", async () => {
    const result = await pool.query<{
      table_name: string;
    }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );

    expect(result.rows).toEqual([{ table_name: "users" }]);
  });

  it("enforces the unique email constraint", async () => {
    await pool.query("insert into users (id, email) values ($1, $2)", [
      randomUUID(),
      "hello@techbros.test",
    ]);

    await expect(
      pool.query("insert into users (id, email) values ($1, $2)", [
        randomUUID(),
        "hello@techbros.test",
      ]),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("returns 200 for GET /ready against the real database", async () => {
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      checks: {
        database: "ok",
      },
    });
  });
});

const loadAppModule = async () => import("../../src/app.js");

const loadDbClient = async () => import("../../src/db/client.js");
