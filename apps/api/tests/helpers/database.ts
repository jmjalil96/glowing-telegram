import type { Pool } from "pg";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(
  new URL("../../src/db/migrations", import.meta.url),
);

export const runMigrations = async (
  db: Parameters<typeof migrate>[0],
): Promise<void> => {
  await migrate(db, {
    migrationsFolder,
  });
};

export const truncateTables = async (
  pool: Pool,
  tableNames: string[],
): Promise<void> => {
  if (tableNames.length === 0) {
    return;
  }

  const tableList = tableNames.map((tableName) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    return `"${tableName}"`;
  });

  await pool.query(
    `truncate table ${tableList.join(", ")} restart identity cascade`,
  );
};
