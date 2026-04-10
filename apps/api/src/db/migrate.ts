import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

import { db, pool } from "./client.js";

const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);

const run = async (): Promise<void> => {
  try {
    await migrate(db, {
      migrationsFolder,
    });
  } finally {
    await pool.end();
  }
};

await run();
