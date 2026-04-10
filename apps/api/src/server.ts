import type { Server } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closePool, verifyDatabaseConnection } from "./db/client.js";
import { logger } from "./lib/logger.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const app = createApp();
let server: Server | null = null;

let shutdownPromise: Promise<void> | null = null;

const listen = async (port: number): Promise<Server> =>
  new Promise((resolve, reject) => {
    const httpServer = app.listen(port);

    const handleError = (error: Error): void => {
      httpServer.off("listening", handleListening);
      reject(error);
    };

    const handleListening = (): void => {
      httpServer.off("error", handleError);
      resolve(httpServer);
    };

    httpServer.once("error", handleError);
    httpServer.once("listening", handleListening);
  });

const closeServer = async (httpServer: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const performShutdown = async (
  signal: (typeof SHUTDOWN_SIGNALS)[number],
): Promise<void> => {
  logger.info({ signal }, "Shutdown signal received");

  const timeout = setTimeout(() => {
    logger.error(
      { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "Graceful shutdown timed out",
    );

    server?.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    if (!server) {
      throw new Error("HTTP server is not initialized");
    }

    const closeServerPromise = closeServer(server);

    server.closeIdleConnections();

    await Promise.all([closeServerPromise, closePool()]);

    clearTimeout(timeout);
    logger.info({ signal }, "Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    server?.closeAllConnections();
    logger.error({ err: error, signal }, "Graceful shutdown failed");
    process.exit(1);
  }
};

const handleSignal = (signal: (typeof SHUTDOWN_SIGNALS)[number]): void => {
  if (shutdownPromise) {
    logger.warn({ signal }, "Shutdown already in progress");
    return;
  }

  shutdownPromise = performShutdown(signal);
};

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, () => {
    handleSignal(signal);
  });
}

const startServer = async (): Promise<void> => {
  try {
    await verifyDatabaseConnection();
    logger.info("Database startup check passed");
  } catch (error) {
    logger.error({ err: error }, "Database startup check failed");
    await closePool();
    process.exit(1);
  }

  try {
    server = await listen(env.PORT);
    logger.info({ port: env.PORT }, "API server listening");
  } catch (error) {
    logger.error({ err: error, port: env.PORT }, "HTTP server startup failed");
    await closePool();
    process.exit(1);
  }
};

await startServer();
