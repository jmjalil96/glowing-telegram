import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { databaseSchema } from "./schema.js";

export const poolConfig = Object.freeze({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT_MS,
});

export const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});

export const db = drizzle({
  client: pool,
  schema: databaseSchema,
});

export const closePool = async (): Promise<void> => {
  await pool.end();
};
