import { fileURLToPath } from "node:url";

import dotenvFlow from "dotenv-flow";
import { defineConfig } from "drizzle-kit";

const packageRoot = fileURLToPath(new URL("./", import.meta.url));

dotenvFlow.config({
  path: packageRoot,
  default_node_env: "development",
  silent: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
  out: "./src/platform/database/migrations",
  schema: "./src/platform/database/schema/**/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
