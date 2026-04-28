import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  runMigrationsForConnectionString,
  startTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";
import {
  expectHttpUnavailable,
  waitForHttpReady,
  waitForHttpResponse,
} from "../helpers/http.js";
import {
  getFreePort,
  occupyPort,
  startTcpProxy,
  type OccupiedPort,
  type TcpProxy,
} from "../helpers/network.js";
import {
  startServerProcess,
  stopProcess,
  waitForExit,
  type StartedServerProcess,
} from "../helpers/process.js";

const PROCESS_ENV = {
  LOG_LEVEL: "silent",
  PG_CONNECT_TIMEOUT_MS: "250",
} as const;

describe("server operational contract", () => {
  let testDatabase: TestDatabase;
  let databaseProxy: TcpProxy;

  const startedProcesses = new Set<StartedServerProcess>();
  const occupiedPorts = new Set<OccupiedPort>();

  const getProxiedDatabaseUrl = (): string => {
    const connectionUrl = new URL(testDatabase.connectionString);

    connectionUrl.hostname = databaseProxy.host;
    connectionUrl.port = String(databaseProxy.port);

    return connectionUrl.toString();
  };

  const getUnmigratedDatabaseUrl = (): string => {
    const connectionUrl = new URL(testDatabase.connectionString);

    connectionUrl.pathname = "/postgres";

    return connectionUrl.toString();
  };

  const startServer = (
    databaseUrl: string,
    port: number,
    extraEnv: Record<string, string | undefined> = {},
  ): StartedServerProcess => {
    const serverProcess = startServerProcess({
      databaseUrl,
      port,
      extraEnv: {
        ...PROCESS_ENV,
        ...extraEnv,
      },
    });

    startedProcesses.add(serverProcess);

    return serverProcess;
  };

  const waitForReadyOk = async (port: number): Promise<Response> =>
    waitForHttpResponse(
      `http://127.0.0.1:${port}/ready`,
      (response) => response.status === 200,
    );

  const waitForReadyError = async (port: number): Promise<Response> =>
    waitForHttpResponse(
      `http://127.0.0.1:${port}/ready`,
      (response) => response.status === 503,
    );

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);

    const databaseUrl = new URL(testDatabase.connectionString);
    const proxyPort = await getFreePort();

    databaseProxy = await startTcpProxy({
      targetHost: databaseUrl.hostname,
      targetPort: Number(databaseUrl.port),
      listenPort: proxyPort,
    });
  });

  afterEach(async () => {
    databaseProxy.enable();

    for (const startedProcess of startedProcesses) {
      await stopProcess(startedProcess.childProcess);
    }

    startedProcesses.clear();

    for (const occupiedPort of occupiedPorts) {
      await occupiedPort.close();
    }

    occupiedPorts.clear();
  });

  afterAll(async () => {
    await databaseProxy.close();
    await testDatabase.stop();
  });

  it("boots and becomes reachable with a healthy migrated database", async () => {
    const port = await getFreePort();

    startServer(getProxiedDatabaseUrl(), port);

    const healthResponse = await waitForHttpReady(
      `http://127.0.0.1:${port}/health`,
    );

    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      status: "ok",
    });

    const readyResponse = await waitForReadyOk(port);

    await expect(readyResponse.json()).resolves.toEqual({
      status: "ok",
      checks: {
        database: "ok",
      },
    });

    const statusResponse = await fetch(
      `http://127.0.0.1:${port}/api/v1/status`,
    );

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      status: "ok",
    });
  });

  it("fails startup when the database is unreachable", async () => {
    const databasePort = await getFreePort();
    const port = await getFreePort();

    const startedProcess = startServer(
      `postgresql://postgres:postgres@127.0.0.1:${databasePort}/techbros_api_test`,
      port,
    );

    await expect(waitForExit(startedProcess.childProcess)).resolves.toBe(1);
    await expectHttpUnavailable(`http://127.0.0.1:${port}/health`);
  });

  it("fails startup when the HTTP port is already in use", async () => {
    const port = await getFreePort();
    const occupiedPort = await occupyPort(port);

    occupiedPorts.add(occupiedPort);

    const startedProcess = startServer(getProxiedDatabaseUrl(), port);

    await expect(waitForExit(startedProcess.childProcess)).resolves.toBe(1);
  });

  it("fails startup when the database is reachable but the schema version is unusable", async () => {
    const port = await getFreePort();
    const startedProcess = startServer(getUnmigratedDatabaseUrl(), port);

    await expect(waitForExit(startedProcess.childProcess)).resolves.toBe(1);
    await expectHttpUnavailable(`http://127.0.0.1:${port}/health`);
  });

  it("/health stays 200 during a database outage", async () => {
    const port = await getFreePort();
    const startedProcess = startServer(getProxiedDatabaseUrl(), port);

    await waitForReadyOk(port);
    databaseProxy.disable();

    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);

    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      status: "ok",
    });
    expect(startedProcess.childProcess.exitCode).toBeNull();
  });

  it("/ready flips to 503 during a database outage", async () => {
    const port = await getFreePort();

    startServer(getProxiedDatabaseUrl(), port);

    await waitForReadyOk(port);
    databaseProxy.disable();

    const readyResponse = await waitForReadyError(port);

    await expect(readyResponse.json()).resolves.toEqual({
      status: "error",
      checks: {
        database: "error",
      },
    });
  });

  it("/ready recovers to 200 after the database path is restored", async () => {
    const port = await getFreePort();

    startServer(getProxiedDatabaseUrl(), port);

    await waitForReadyOk(port);
    databaseProxy.disable();
    await waitForReadyError(port);

    databaseProxy.enable();

    const readyResponse = await waitForReadyOk(port);

    await expect(readyResponse.json()).resolves.toEqual({
      status: "ok",
      checks: {
        database: "ok",
      },
    });
  });

  it("shuts down gracefully on SIGTERM", async () => {
    const port = await getFreePort();
    const startedProcess = startServer(getProxiedDatabaseUrl(), port);

    await waitForHttpReady(`http://127.0.0.1:${port}/health`);

    await expect(stopProcess(startedProcess.childProcess)).resolves.toBe(0);
    await expectHttpUnavailable(`http://127.0.0.1:${port}/health`);
  });
});
