import dotenvFlow from "dotenv-flow";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
const defaultDevelopmentCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;
const defaultDevelopmentWebAppUrl = "http://localhost:5173";
const defaultDevelopmentEmailFrom = "no-reply@techbros.local";
const defaultDevelopmentSmtpHost = "127.0.0.1";
const defaultDevelopmentSmtpPort = 2500;
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

interface ResolvedSmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  emailFrom: string;
  emailReplyTo: string | undefined;
}

const getConfigError = (details: string[]): Error =>
  new Error(`Invalid environment configuration:\n${details.join("\n")}`);

const optionalString = () =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().optional(),
  );

const optionalPort = () =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.coerce.number().int().min(1).max(65535).optional(),
  );

const optionalBoolean = () =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((candidate) =>
        typeof candidate === "boolean" ? candidate : candidate === "true",
      )
      .optional(),
  );

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

const resolveWebAppUrl = (
  nodeEnv: NodeEnv,
  rawUrl: string | undefined,
): string => {
  if (rawUrl === undefined) {
    if (nodeEnv === "production") {
      throw new Error("must be set in production");
    }

    return defaultDevelopmentWebAppUrl;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("must be an absolute URL");
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "must contain only a bare app URL without paths or query strings",
    );
  }

  return parsedUrl.origin;
};

const resolveSmtpConfig = (
  nodeEnv: NodeEnv,
  rawConfig: {
    SMTP_HOST?: string | undefined;
    SMTP_PORT?: number | undefined;
    SMTP_SECURE?: boolean | undefined;
    SMTP_USER?: string | undefined;
    SMTP_PASSWORD?: string | undefined;
    EMAIL_FROM?: string | undefined;
    EMAIL_REPLY_TO?: string | undefined;
  },
): ResolvedSmtpConfig => {
  const host = rawConfig.SMTP_HOST;

  if ((rawConfig.SMTP_USER ?? rawConfig.SMTP_PASSWORD) !== undefined) {
    if (
      rawConfig.SMTP_USER === undefined ||
      rawConfig.SMTP_PASSWORD === undefined
    ) {
      throw new Error("SMTP_USER and SMTP_PASSWORD must be provided together");
    }
  }

  if (nodeEnv === "production") {
    if (host === undefined) {
      throw new Error("SMTP_HOST: must be set in production");
    }

    if (rawConfig.EMAIL_FROM === undefined) {
      throw new Error("EMAIL_FROM: must be set in production");
    }
  }

  if (host === undefined) {
    return {
      smtpHost: defaultDevelopmentSmtpHost,
      smtpPort: defaultDevelopmentSmtpPort,
      smtpSecure: false,
      smtpUser: undefined,
      smtpPassword: undefined,
      emailFrom: rawConfig.EMAIL_FROM ?? defaultDevelopmentEmailFrom,
      emailReplyTo: rawConfig.EMAIL_REPLY_TO,
    };
  }

  return {
    smtpHost: host,
    smtpPort:
      rawConfig.SMTP_PORT ?? (rawConfig.SMTP_SECURE === true ? 465 : 587),
    smtpSecure: rawConfig.SMTP_SECURE ?? false,
    smtpUser: rawConfig.SMTP_USER,
    smtpPassword: rawConfig.SMTP_PASSWORD,
    emailFrom: rawConfig.EMAIL_FROM ?? defaultDevelopmentEmailFrom,
    emailReplyTo: rawConfig.EMAIL_REPLY_TO,
  };
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
  WEB_APP_URL: optionalString(),
  LOG_LEVEL: z.enum(logLevels).optional(),
  PG_POOL_MAX: z.coerce.number().int().min(1).default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
  PG_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5_000),
  SMTP_HOST: optionalString(),
  SMTP_PORT: optionalPort(),
  SMTP_SECURE: optionalBoolean(),
  SMTP_USER: optionalString(),
  SMTP_PASSWORD: optionalString(),
  EMAIL_FROM: optionalString(),
  EMAIL_REPLY_TO: optionalString(),
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
let webAppUrl = "";
let smtpConfig: ResolvedSmtpConfig | null = null;

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

try {
  webAppUrl = resolveWebAppUrl(
    parsedEnv.data.NODE_ENV,
    parsedEnv.data.WEB_APP_URL,
  );
} catch (error) {
  configErrors.push(
    `WEB_APP_URL: ${error instanceof Error ? error.message : "is invalid"}`,
  );
}

try {
  smtpConfig = resolveSmtpConfig(parsedEnv.data.NODE_ENV, parsedEnv.data);
} catch (error) {
  configErrors.push(
    error instanceof Error ? error.message : "SMTP: is invalid",
  );
}

if (configErrors.length > 0) {
  throw getConfigError(configErrors);
}

export const env = Object.freeze({
  ...parsedEnv.data,
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  WEB_APP_URL: webAppUrl,
  LOG_LEVEL:
    parsedEnv.data.LOG_LEVEL ??
    (parsedEnv.data.NODE_ENV === "development" ? "debug" : "info"),
  SMTP_HOST: smtpConfig?.smtpHost ?? defaultDevelopmentSmtpHost,
  SMTP_PORT: smtpConfig?.smtpPort ?? defaultDevelopmentSmtpPort,
  SMTP_SECURE: smtpConfig?.smtpSecure ?? false,
  SMTP_USER: smtpConfig?.smtpUser,
  SMTP_PASSWORD: smtpConfig?.smtpPassword,
  EMAIL_FROM: smtpConfig?.emailFrom ?? defaultDevelopmentEmailFrom,
  EMAIL_REPLY_TO: smtpConfig?.emailReplyTo,
});
