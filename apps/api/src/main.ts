import type { Server } from "node:http";
import type { Express } from "express";

import { createApp } from "./bootstrap/create-app.js";
import { createDependencies } from "./bootstrap/create-dependencies.js";
import { registerShutdownHandlers } from "./bootstrap/shutdown.js";
import { env } from "./platform/config/env.js";
import { closePool } from "./platform/database/client.js";
import { verifyDatabaseOperationalReadiness } from "./platform/database/readiness.js";
import { logger } from "./platform/logger/logger.js";

const listen = async (app: Express, port: number): Promise<Server> =>
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

const start = async (): Promise<void> => {
  const dependencies = createDependencies();
  const app = createApp(dependencies);

  try {
    await verifyDatabaseOperationalReadiness();
    logger.info("Database startup readiness check passed");
  } catch (error) {
    logger.error({ err: error }, "Database startup readiness check failed");
    await closePool();
    process.exit(1);
  }

  try {
    const server = await listen(app, env.PORT);

    registerShutdownHandlers({
      closeResources: closePool,
      logger,
      server,
    });
    logger.info({ port: env.PORT }, "API server listening");
  } catch (error) {
    logger.error({ err: error, port: env.PORT }, "HTTP server startup failed");
    await closePool();
    process.exit(1);
  }
};

await start();
