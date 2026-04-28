import type { ValidatedRouteHandler } from "../../../platform/http/validated-request.js";
import { buildAuditContext } from "../../../platform/audit/index.js";
import { clearSessionCookie } from "./cookies.js";
import type { resetPasswordSchema } from "./reset-password.schema.js";
import type { ResetPasswordParams } from "../application/reset-password.use-case.js";

interface CreateResetPasswordHandlerOptions {
  resetPasswordService: {
    resetPassword(params: ResetPasswordParams): Promise<void>;
  };
}

type ResetPasswordRouteSchema = typeof resetPasswordSchema;

export const createResetPasswordHandler = (
  options: CreateResetPasswordHandlerOptions,
): ValidatedRouteHandler<ResetPasswordRouteSchema> => {
  const authResetPasswordService = options.resetPasswordService;

  return async ({ body }, req, res) => {
    await authResetPasswordService.resetPassword({
      ...body,
      auditContext: buildAuditContext({
        requestId: req.requestId,
        ...(req.ip ? { ip: req.ip } : {}),
        get: (name) => req.get(name),
      }),
    } satisfies ResetPasswordParams);

    clearSessionCookie(res);
    res.status(200).json({
      success: true,
    });
  };
};
