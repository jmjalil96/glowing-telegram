import compression from "compression";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Router } from "express";

import { env } from "../platform/config/env.js";
import { errorHandlerMiddleware } from "../platform/http/error-handler.middleware.js";
import { notFoundMiddleware } from "../platform/http/not-found.middleware.js";
import { requestIdMiddleware } from "../platform/http/request-id.middleware.js";
import { logger } from "../platform/logger/logger.js";
import { healthRouter } from "../routes/health.routes.js";
import { readinessRouter } from "../routes/readiness.routes.js";

interface CreateAppOptions {
  apiV1Router: Router;
}

export const createApp = ({ apiV1Router }: CreateAppOptions): Express => {
  const app = express();
  const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req: Request) => req.requestId,
      customProps: (req: Request, _res: Response) => ({
        requestId: req.requestId,
      }),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, false);
          return;
        }

        callback(null, allowedOrigins.has(origin));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(healthRouter);
  app.use(readinessRouter);
  app.use("/api/v1", apiV1Router);
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
};
