import { afterEach, describe, expect, it } from "vitest";

import { importFresh, resetModuleGraph } from "../helpers/module.js";

describe("auth configuration", () => {
  const envKeys = [
    "NODE_ENV",
    "CORS_ALLOWED_ORIGINS",
    "WEB_APP_URL",
    "SMTP_HOST",
    "EMAIL_FROM",
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

  it("defaults development and test WEB_APP_URL to the local web app", async () => {
    delete process.env.WEB_APP_URL;
    process.env.NODE_ENV = "test";

    const { env } = await importFresh(() => import("../../src/config/env.js"));

    expect(env.WEB_APP_URL).toBe("http://localhost:5173");
  });

  it("rejects missing production WEB_APP_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.techbros.test";
    process.env.SMTP_HOST = "smtp.techbros.test";
    process.env.EMAIL_FROM = "no-reply@techbros.test";
    delete process.env.WEB_APP_URL;

    await expect(
      importFresh(() => import("../../src/config/env.js")),
    ).rejects.toThrow(
      "Invalid environment configuration:\nWEB_APP_URL: must be set in production",
    );
  });

  it("rejects non-bare WEB_APP_URL values", async () => {
    process.env.NODE_ENV = "development";
    process.env.WEB_APP_URL = "https://app.techbros.test/reset-password";

    await expect(
      importFresh(() => import("../../src/config/env.js")),
    ).rejects.toThrow(
      "Invalid environment configuration:\nWEB_APP_URL: must contain only a bare app URL without paths or query strings",
    );
  });
});
