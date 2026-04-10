import dotenvFlow from "dotenv-flow";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultDevelopmentCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;
const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

type NodeEnv = "development" | "test" | "production";

const getConfigError = (details: string[]): Error =>
  new Error(`Invalid environment configuration:\n${details.join("\n")}`);

const parseAllowedOrigins = (rawOrigins: string | undefined): string[] => {
  if (!rawOrigins) {
    return [];
  }

  return [...new Set(rawOrigins.split(",").map((origin) => origin.trim()))]
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let parsedOrigin: URL;

      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error("must contain only absolute origins");
      }

      if (
        parsedOrigin.username ||
        parsedOrigin.password ||
        parsedOrigin.pathname !== "/" ||
        parsedOrigin.search ||
        parsedOrigin.hash
      ) {
        throw new Error(
          "must contain only bare origins without paths or query strings",
        );
      }

      return parsedOrigin.origin;
    });
};

const resolveAllowedOrigins = (
  nodeEnv: NodeEnv,
  rawOrigins: string | undefined,
): string[] => {
  const allowedOrigins = parseAllowedOrigins(rawOrigins);

  if (allowedOrigins.length > 0) {
    return allowedOrigins;
  }

  if (nodeEnv === "production") {
    throw new Error("must be set in production");
  }

  return [...defaultDevelopmentCorsOrigins];
};

dotenvFlow.config({
  path: packageRoot,
  default_node_env: "development",
  silent: true,
});

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(logLevels).optional(),
  PG_POOL_MAX: z.coerce.number().int().min(1).default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
  PG_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5_000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw getConfigError(
    parsedEnv.error.issues.map((issue) => {
      const field = issue.path.join(".") || "env";

      return `${field}: ${issue.message}`;
    }),
  );
}

const configErrors: string[] = [];

let corsAllowedOrigins: string[] = [];

try {
  corsAllowedOrigins = resolveAllowedOrigins(
    parsedEnv.data.NODE_ENV,
    parsedEnv.data.CORS_ALLOWED_ORIGINS,
  );
} catch (error) {
  configErrors.push(
    `CORS_ALLOWED_ORIGINS: ${
      error instanceof Error ? error.message : "is invalid"
    }`,
  );
}

if (configErrors.length > 0) {
  throw getConfigError(configErrors);
}

export const env = Object.freeze({
  ...parsedEnv.data,
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  LOG_LEVEL:
    parsedEnv.data.LOG_LEVEL ??
    (parsedEnv.data.NODE_ENV === "development" ? "debug" : "info"),
});
