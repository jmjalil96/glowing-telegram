import type { db } from "../../../platform/database/client.js";

export type IdentityDatabaseExecutor = Pick<
  typeof db,
  "insert" | "select" | "update"
>;
