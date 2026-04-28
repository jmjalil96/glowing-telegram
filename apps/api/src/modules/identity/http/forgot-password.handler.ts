import type { ValidatedRouteHandler } from "../../../platform/http/validated-request.js";
import { buildAuditContext } from "../../../platform/audit/index.js";
import type { forgotPasswordSchema } from "./forgot-password.schema.js";
import type { ForgotPasswordParams } from "../application/forgot-password.use-case.js";

interface CreateForgotPasswordHandlerOptions {
  forgotPasswordService: {
    forgotPassword(params: ForgotPasswordParams): Promise<void>;
  };
}

type ForgotPasswordRouteSchema = typeof forgotPasswordSchema;

export const createForgotPasswordHandler = (
  options: CreateForgotPasswordHandlerOptions,
): ValidatedRouteHandler<ForgotPasswordRouteSchema> => {
  const authForgotPasswordService = options.forgotPasswordService;

  return async ({ body }, req, res) => {
    await authForgotPasswordService.forgotPassword({
      ...body,
      auditContext: buildAuditContext({
        requestId: req.requestId,
        ...(req.ip ? { ip: req.ip } : {}),
        get: (name) => req.get(name),
      }),
    } satisfies ForgotPasswordParams);

    res.status(200).json({
      success: true,
    });
  };
};
