import { Router } from "express";

import { authRouter } from "../../../features/auth/auth.router.js";

export const apiV1Router = Router();

apiV1Router.use("/auth", authRouter);

apiV1Router.get("/status", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});
