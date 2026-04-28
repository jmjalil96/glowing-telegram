import { Router, type RequestHandler } from "express";

import { route } from "../../../platform/http/validate-request.js";
import type { ValidatedRouteHandler } from "../../../platform/http/validated-request.js";
import { forgotPasswordSchema } from "./forgot-password.schema.js";
import { loginSchema } from "./login.schema.js";
import { resetPasswordSchema } from "./reset-password.schema.js";

type LoginHandler = ValidatedRouteHandler<typeof loginSchema>;
type ForgotPasswordHandler = ValidatedRouteHandler<typeof forgotPasswordSchema>;
type ResetPasswordHandler = ValidatedRouteHandler<typeof resetPasswordSchema>;

interface CreateIdentityRouterOptions {
  forgotPasswordHandler: ForgotPasswordHandler;
  loadAuthMiddleware: RequestHandler;
  loginHandler: LoginHandler;
  logoutHandler: RequestHandler;
  meHandler: RequestHandler;
  requireAuthMiddleware: RequestHandler;
  resetPasswordHandler: ResetPasswordHandler;
}

export const createIdentityRouter = ({
  forgotPasswordHandler,
  loadAuthMiddleware,
  loginHandler,
  logoutHandler,
  meHandler,
  requireAuthMiddleware,
  resetPasswordHandler,
}: CreateIdentityRouterOptions): Router => {
  const authRouter = Router();

  authRouter.use(loadAuthMiddleware);
  authRouter.post("/login", route(loginSchema, loginHandler));
  authRouter.post(
    "/forgot-password",
    route(forgotPasswordSchema, forgotPasswordHandler),
  );
  authRouter.post(
    "/reset-password",
    route(resetPasswordSchema, resetPasswordHandler),
  );
  authRouter.get("/me", requireAuthMiddleware, meHandler);
  authRouter.post("/logout", requireAuthMiddleware, logoutHandler);

  return authRouter;
};
