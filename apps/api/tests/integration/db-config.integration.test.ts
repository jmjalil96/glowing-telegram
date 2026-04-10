import { afterEach, describe, expect, it } from "vitest";

import { importFresh, resetModuleGraph } from "../helpers/module.js";

describe("database client configuration", () => {
  const envKeys = [
    "PG_POOL_MAX",
    "PG_IDLE_TIMEOUT_MS",
    "PG_CONNECT_TIMEOUT_MS",
  ] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  afterEach(async () => {
    const loadedDbClient = await import("../../src/db/client.js").catch(
      () => null,
    );

    await loadedDbClient?.closePool().catch(() => undefined);

    for (const [key, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }

    resetModuleGraph();
  });

  it("applies configured pool and readiness client settings", async () => {
    process.env.PG_POOL_MAX = "7";
    process.env.PG_IDLE_TIMEOUT_MS = "15000";
    process.env.PG_CONNECT_TIMEOUT_MS = "4321";

    const { createReadinessClient, pool } = await importFresh(
      () => import("../../src/db/client.js"),
    );
    const readinessClient = createReadinessClient() as ReturnType<
      typeof createReadinessClient
    > & {
      _connectionTimeoutMillis: number;
      connectionParameters: {
        query_timeout?: number;
      };
    };

    try {
      expect(pool.options.max).toBe(7);
      expect(pool.options.idleTimeoutMillis).toBe(15_000);
      expect(pool.options.connectionTimeoutMillis).toBe(4_321);
      expect(pool.options.query_timeout).toBeUndefined();
      expect(readinessClient._connectionTimeoutMillis).toBe(4_321);
      expect(readinessClient.connectionParameters.query_timeout).toBe(1_000);
    } finally {
      await readinessClient.end().catch(() => undefined);
    }
  });
});
