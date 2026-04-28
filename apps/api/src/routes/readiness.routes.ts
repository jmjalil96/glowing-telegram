import { Router } from "express";

import { isDatabaseReady } from "../platform/database/readiness.js";

export const readinessRouter = Router();

readinessRouter.get("/ready", async (req, res) => {
  const databaseReady = await isDatabaseReady();

  if (!databaseReady) {
    req.log.warn({ requestId: req.requestId }, "Readiness check failed");

    res.status(503).json({
      status: "error",
      checks: {
        database: "error",
      },
    });

    return;
  }

  res.status(200).json({
    status: "ok",
    checks: {
      database: "ok",
    },
  });
});
