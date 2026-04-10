import { Router } from "express";

export const apiV1Router = Router();

apiV1Router.get("/status", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});
