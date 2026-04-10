import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import { env } from "../config/env.js";
import { usersTable } from "./schema/users.js";

const READINESS_QUERY_TIMEOUT_MS = 1_000;

export const poolConfig = Object.freeze({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT_MS,
});

export const pool = new Pool(poolConfig);

export const db = drizzle({
  client: pool,
  schema: {
    usersTable,
  },
});

export const verifyDatabaseConnection = async (): Promise<void> => {
  await pool.query("select 1");
};

export const createReadinessClient = (): Client =>
  new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT_MS,
    query_timeout: READINESS_QUERY_TIMEOUT_MS,
  });

export const isDatabaseReady = async (): Promise<boolean> => {
  const readinessClient = createReadinessClient();

  try {
    await readinessClient.connect();
    await readinessClient.query("select 1");

    return true;
  } catch {
    return false;
  } finally {
    await readinessClient.end().catch(() => undefined);
  }
};

export const closePool = async (): Promise<void> => {
  await pool.end();
};
