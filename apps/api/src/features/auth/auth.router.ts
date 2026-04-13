import { Router } from "express";

import { loadAuthMiddleware } from "../../middlewares/load-auth.js";
import { requireAuthMiddleware } from "../../middlewares/require-auth.js";
import { route } from "../../middlewares/validate-request.js";
import { forgotPasswordHandler } from "./forgot-password/forgot-password.handler.js";
import { forgotPasswordSchema } from "./forgot-password/forgot-password.schema.js";
import { loginHandler } from "./login/login.handler.js";
import { loginSchema } from "./login/login.schema.js";
import { meHandler } from "./me/me.handler.js";
import { logoutHandler } from "./logout/logout.handler.js";
import { resetPasswordHandler } from "./reset-password/reset-password.handler.js";
import { resetPasswordSchema } from "./reset-password/reset-password.schema.js";

export const authRouter = Router();

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
