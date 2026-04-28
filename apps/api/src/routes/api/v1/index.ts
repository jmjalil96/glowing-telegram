import { Router, type Router as ExpressRouter } from "express";

interface CreateApiV1RouterOptions {
  authRouter: ExpressRouter;
}

export const createApiV1Router = ({
  authRouter,
}: CreateApiV1RouterOptions): ExpressRouter => {
  const apiV1Router = Router();

  apiV1Router.use("/auth", authRouter);

  apiV1Router.get("/status", (_req, res) => {
    res.status(200).json({
      status: "ok",
    });
  });

  return apiV1Router;
};
