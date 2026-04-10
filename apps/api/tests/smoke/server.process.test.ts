import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, describe, expect, it } from "vitest";

import { getFreePort } from "../helpers/network.js";
import {
  collectProcessLogs,
  waitForExit,
  waitForLog,
} from "../helpers/process.js";
import { waitForHttpReady } from "../helpers/http.js";

const apiPackageDir = fileURLToPath(new URL("../../", import.meta.url));
const tsxBinary = join(
  apiPackageDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

describe("server process smoke", () => {
  let startedContainer: Awaited<
    ReturnType<PostgreSqlContainer["start"]>
  > | null = null;

  afterAll(async () => {
    if (startedContainer) {
      await startedContainer.stop();
    }
  });

  it("starts against a reachable database and exits cleanly on SIGTERM", async () => {
    const port = await getFreePort();
    startedContainer = await new PostgreSqlContainer("postgres:17")
      .withDatabase("techbros_api_process_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    const childProcess = spawn(tsxBinary, ["src/server.ts"], {
      cwd: apiPackageDir,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        DATABASE_URL: startedContainer.getConnectionUri(),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const logs = collectProcessLogs(childProcess);

    try {
      await waitForLog(logs, (entry) =>
        entry.line.includes("Database startup check passed"),
      );
      await waitForLog(logs, (entry) =>
        entry.line.includes("API server listening"),
      );

      const startupCheckIndex = logs.findIndex((entry) =>
        entry.line.includes("Database startup check passed"),
      );
      const listenIndex = logs.findIndex((entry) =>
        entry.line.includes("API server listening"),
      );

      expect(startupCheckIndex).toBeGreaterThanOrEqual(0);
      expect(listenIndex).toBeGreaterThan(startupCheckIndex);

      const healthResponse = await waitForHttpReady(
        `http://127.0.0.1:${port}/health`,
      );
      expect(healthResponse.status).toBe(200);

      const readyResponse = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(readyResponse.status).toBe(200);

      childProcess.kill("SIGTERM");

      await waitForLog(logs, (entry) =>
        entry.line.includes("Graceful shutdown completed"),
      );

      const exitCode = await waitForExit(childProcess);

      expect(exitCode).toBe(0);
    } finally {
      if (childProcess.exitCode === null) {
        childProcess.kill("SIGKILL");
        await waitForExit(childProcess).catch(() => undefined);
      }

      await startedContainer.stop();
      startedContainer = null;
    }
  });

  it("fails before listening when the database is unreachable", async () => {
    const port = await getFreePort();
    const childProcess = spawn(tsxBinary, ["src/server.ts"], {
      cwd: apiPackageDir,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:9/techbros_api_process_test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const logs = collectProcessLogs(childProcess);

    await waitForLog(logs, (entry) =>
      entry.line.includes("Database startup check failed"),
    );

    const exitCode = await waitForExit(childProcess);

    expect(exitCode).toBe(1);
    expect(
      logs.some((entry) => entry.line.includes("API server listening")),
    ).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  it("fails cleanly when the configured port is already in use", async () => {
    const port = await getFreePort();
    const occupiedServer = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("occupied");
    });
    startedContainer = await new PostgreSqlContainer("postgres:17")
      .withDatabase("techbros_api_port_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    await new Promise<void>((resolve, reject) => {
      occupiedServer.once("error", reject);
      occupiedServer.listen(port, () => {
        occupiedServer.off("error", reject);
        resolve();
      });
    });

    const childProcess = spawn(tsxBinary, ["src/server.ts"], {
      cwd: apiPackageDir,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        DATABASE_URL: startedContainer.getConnectionUri(),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const logs = collectProcessLogs(childProcess);

    try {
      await waitForLog(logs, (entry) =>
        entry.line.includes("Database startup check passed"),
      );
      await waitForLog(logs, (entry) =>
        entry.line.includes("HTTP server startup failed"),
      );

      const exitCode = await waitForExit(childProcess);

      expect(exitCode).toBe(1);
      expect(
        logs.some((entry) => entry.line.includes("API server listening")),
      ).toBe(false);
    } finally {
      occupiedServer.close();

      if (childProcess.exitCode === null) {
        childProcess.kill("SIGKILL");
        await waitForExit(childProcess).catch(() => undefined);
      }

      await startedContainer.stop();
      startedContainer = null;
    }
  });
});
