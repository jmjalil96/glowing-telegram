import { afterEach, describe, expect, it } from "vitest";

import { importFresh, resetModuleGraph } from "../helpers/module.js";

describe("email configuration", () => {
  const envKeys = [
    "NODE_ENV",
    "CORS_ALLOWED_ORIGINS",
    "WEB_APP_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
  ] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }

    resetModuleGraph();
  });

  it("defaults development and test SMTP settings to local Inbucket", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;

    process.env.NODE_ENV = "test";

    const { env } = await importFresh(() => import("../../src/config/env.js"));

    expect(env.SMTP_HOST).toBe("127.0.0.1");
    expect(env.SMTP_PORT).toBe(2500);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("no-reply@techbros.local");
    expect(env.EMAIL_REPLY_TO).toBeUndefined();
  });

  it("rejects missing production SMTP host", async () => {
    delete process.env.SMTP_HOST;
    process.env.CORS_ALLOWED_ORIGINS = "https://app.techbros.test";
    process.env.WEB_APP_URL = "https://app.techbros.test";
    process.env.EMAIL_FROM = "no-reply@techbros.test";
    process.env.NODE_ENV = "production";

    await expect(
      importFresh(() => import("../../src/config/env.js")),
    ).rejects.toThrow(
      "Invalid environment configuration:\nSMTP_HOST: must be set in production",
    );
  });

  it("rejects missing production sender address", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.techbros.test";
    process.env.WEB_APP_URL = "https://app.techbros.test";
    process.env.SMTP_HOST = "smtp.techbros.test";
    delete process.env.EMAIL_FROM;
    process.env.NODE_ENV = "production";

    await expect(
      importFresh(() => import("../../src/config/env.js")),
    ).rejects.toThrow(
      "Invalid environment configuration:\nEMAIL_FROM: must be set in production",
    );
  });

  it("rejects partial SMTP authentication settings", async () => {
    process.env.NODE_ENV = "development";
    process.env.SMTP_HOST = "smtp.techbros.test";
    process.env.SMTP_USER = "mailer";
    delete process.env.SMTP_PASSWORD;

    await expect(
      importFresh(() => import("../../src/config/env.js")),
    ).rejects.toThrow(
      "Invalid environment configuration:\nSMTP_USER and SMTP_PASSWORD must be provided together",
    );
  });

  it("derives the default secure SMTP port when the host is configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.SMTP_HOST = "smtp.techbros.test";
    delete process.env.SMTP_PORT;
    process.env.SMTP_SECURE = "true";

    const { env } = await importFresh(() => import("../../src/config/env.js"));

    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it("derives the default insecure SMTP port when the host is configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.SMTP_HOST = "smtp.techbros.test";
    delete process.env.SMTP_PORT;
    process.env.SMTP_SECURE = "false";

    const { env } = await importFresh(() => import("../../src/config/env.js"));

    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
  });
});
