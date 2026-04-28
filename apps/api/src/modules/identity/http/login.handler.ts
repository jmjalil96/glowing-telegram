import type { ValidatedRouteHandler } from "../../../platform/http/validated-request.js";
import { buildAuditContext } from "../../../platform/audit/index.js";
import { setSessionCookie } from "./cookies.js";
import type { loginSchema } from "./login.schema.js";
import type {
  LoginParams,
  LoginResult,
} from "../application/login.use-case.js";

interface CreateLoginHandlerOptions {
  loginService: {
    login(params: LoginParams): Promise<LoginResult>;
  };
}

type LoginRouteSchema = typeof loginSchema;

export const createLoginHandler = (
  options: CreateLoginHandlerOptions,
): ValidatedRouteHandler<LoginRouteSchema> => {
  const authLoginService = options.loginService;

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
