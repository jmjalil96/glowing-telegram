import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createAuthFixtureUser,
  runMigrationsForConnectionString,
  startTestDatabase,
  type TestDatabase,
} from "../../../api/tests/helpers/database.js";
import {
  waitForHttpReady,
  waitForHttpResponse,
} from "../../../api/tests/helpers/http.js";
import {
  collectProcessLogs,
  startServerProcess,
  stopProcess,
  type LoggedChildProcess,
  type ProcessLogEntry,
  type StartedServerProcess,
  waitForExit,
} from "../../../api/tests/helpers/process.js";
import { playwrightAuthFixture } from "../helpers/auth-fixtures.js";

const apiPort = 3310;
const host = "127.0.0.1";
const webPort = 4317;
const webPackageRoot = fileURLToPath(new URL("../../", import.meta.url));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let shuttingDown = false;
let startedApiProcess: StartedServerProcess | undefined;
let startedDatabase: TestDatabase | undefined;
let webPreviewProcess: LoggedChildProcess | undefined;
let webBuildLogs: ProcessLogEntry[] = [];
let webPreviewLogs: ProcessLogEntry[] = [];

const createWebEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  VITE_API_TARGET: `http://${host}:${apiPort}`,
});

const spawnLoggedWebProcess = (args: string[]): LoggedChildProcess =>
  spawn(pnpmCommand, args, {
    cwd: webPackageRoot,
    env: createWebEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

const dumpLogs = (): void => {
  for (const entry of startedApiProcess?.logs ?? []) {
    console.error(`[api:${entry.stream}] ${entry.line}`);
  }

  for (const entry of webBuildLogs) {
    console.error(`[web-build:${entry.stream}] ${entry.line}`);
  }

  for (const entry of webPreviewLogs) {
    console.error(`[web-preview:${entry.stream}] ${entry.line}`);
  }
};

const stopWebPreviewProcess = async (): Promise<void> => {
  if (!webPreviewProcess || webPreviewProcess.exitCode !== null) {
    return;
  }

  await stopProcess(webPreviewProcess);
};

const shutdown = async (exitCode = 0): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await stopWebPreviewProcess();

    if (startedApiProcess) {
      await stopProcess(startedApiProcess.childProcess);
    }

    if (startedDatabase) {
      await startedDatabase.stop();
    }
  } finally {
    process.exit(exitCode);
  }
};

const fail = async (error: unknown): Promise<void> => {
  console.error(error);
  dumpLogs();
  await shutdown(1);
};

const buildWebApp = async (): Promise<void> => {
  const buildProcess = spawnLoggedWebProcess(["exec", "vite", "build"]);
  webBuildLogs = collectProcessLogs(buildProcess);

  const exitCode = await waitForExit(buildProcess, 120_000);

  if (exitCode !== 0) {
    throw new Error(`vite build exited with code ${exitCode ?? "unknown"}`);
  }
};

const startWebPreviewServer = async (): Promise<void> => {
  const startedWebProcess = spawnLoggedWebProcess([
    "exec",
    "vite",
    "preview",
    "--host",
    host,
    "--port",
    String(webPort),
    "--strictPort",
  ]);

  webPreviewProcess = startedWebProcess;
  webPreviewLogs = collectProcessLogs(startedWebProcess);

  await waitForHttpReady(`http://${host}:${webPort}/login`, 30_000);
};

const main = async (): Promise<void> => {
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("uncaughtException", (error) => {
    void fail(error);
  });
  process.on("unhandledRejection", (error) => {
    void fail(error);
  });

  startedDatabase = await startTestDatabase();
  await runMigrationsForConnectionString(startedDatabase.connectionString);
  await createAuthFixtureUser(startedDatabase.connectionString, {
    displayName: playwrightAuthFixture.displayName,
    email: playwrightAuthFixture.email,
    password: playwrightAuthFixture.password,
    tenantName: "Playwright Test Tenant",
    tenantSlug: "playwright-test-tenant",
  });

  startedApiProcess = startServerProcess({
    databaseUrl: startedDatabase.connectionString,
    port: apiPort,
    extraEnv: {
      CORS_ALLOWED_ORIGINS: `http://${host}:${webPort}`,
      LOG_LEVEL: "silent",
      WEB_APP_URL: `http://${host}:${webPort}`,
    },
  });

  await waitForHttpReady(`http://${host}:${apiPort}/health`, 30_000);
  await waitForHttpResponse(
    `http://${host}:${apiPort}/ready`,
    (response) => response.status === 200,
    30_000,
  );
  await buildWebApp();
  await startWebPreviewServer();

  await new Promise(() => {
    // Keep the process alive until Playwright stops the webServer command.
  });
};

void main().catch((error) => {
  void fail(error);
});
