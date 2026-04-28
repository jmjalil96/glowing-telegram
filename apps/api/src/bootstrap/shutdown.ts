import type { Server } from "node:http";
import type { Logger } from "pino";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];
type ShutdownLogger = Pick<Logger, "error" | "info" | "warn">;

interface ShutdownProcess {
  exit(code?: number): never;
  on(signal: ShutdownSignal, listener: () => void): unknown;
}

interface RegisterShutdownHandlersOptions {
  closeResources: () => Promise<void>;
  logger: ShutdownLogger;
  process?: ShutdownProcess;
  server: Server;
  signals?: readonly ShutdownSignal[];
  timeoutMs?: number;
}

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

export const registerShutdownHandlers = ({
  closeResources,
  logger,
  process: runtimeProcess = process,
  server,
  signals = SHUTDOWN_SIGNALS,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: RegisterShutdownHandlersOptions): void => {
  let shutdownPromise: Promise<void> | null = null;

  const performShutdown = async (signal: ShutdownSignal): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received");

    const timeout = setTimeout(() => {
      logger.error({ signal, timeoutMs }, "Graceful shutdown timed out");

      server.closeAllConnections();
      runtimeProcess.exit(1);
    }, timeoutMs);

    try {
      const closeServerPromise = closeServer(server);

      server.closeIdleConnections();

      await Promise.all([closeServerPromise, closeResources()]);

      clearTimeout(timeout);
      logger.info({ signal }, "Graceful shutdown completed");
      runtimeProcess.exit(0);
    } catch (error) {
      clearTimeout(timeout);
      server.closeAllConnections();
      logger.error({ err: error, signal }, "Graceful shutdown failed");
      runtimeProcess.exit(1);
    }
  };

  const handleSignal = (signal: ShutdownSignal): void => {
    if (shutdownPromise) {
      logger.warn({ signal }, "Shutdown already in progress");
      return;
    }

    shutdownPromise = performShutdown(signal);
  };

  for (const signal of signals) {
    runtimeProcess.on(signal, () => {
      handleSignal(signal);
    });
  }
};
