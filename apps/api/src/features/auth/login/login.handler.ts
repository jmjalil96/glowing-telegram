import type { ValidatedRouteHandler } from "../../../types/validated-request.js";
import { buildAuditContext } from "../../../services/audit/index.js";
import { setSessionCookie } from "../cookies.js";
import type { loginSchema } from "./login.schema.js";
import { loginService, type LoginParams } from "./login.service.js";

interface CreateLoginHandlerOptions {
  loginService?: Pick<typeof loginService, "login">;
}

type LoginRouteSchema = typeof loginSchema;

export const createLoginHandler = (
  options: CreateLoginHandlerOptions = {},
): ValidatedRouteHandler<LoginRouteSchema> => {
  const authLoginService = options.loginService ?? loginService;

  return async ({ body }, req, res) => {
    const loginResult = await authLoginService.login({
      ...body,
      auditContext: buildAuditContext({
        requestId: req.requestId,
        ...(req.ip ? { ip: req.ip } : {}),
        get: (name) => req.get(name),
      }),
      currentSessionId: req.auth?.sessionId ?? null,
    } satisfies LoginParams);

    setSessionCookie(res, loginResult.sessionToken, loginResult.expiresAt);
    res.status(200).json({
      user: loginResult.user,
    });
  };
};

export const loginHandler = createLoginHandler();
