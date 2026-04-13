import type { ValidatedRouteHandler } from "../../../types/validated-request.js";
import { buildAuditContext } from "../../../services/audit/index.js";
import { clearSessionCookie } from "../cookies.js";
import type { resetPasswordSchema } from "./reset-password.schema.js";
import {
  resetPasswordService,
  type ResetPasswordParams,
} from "./reset-password.service.js";

interface CreateResetPasswordHandlerOptions {
  resetPasswordService?: Pick<typeof resetPasswordService, "resetPassword">;
}

type ResetPasswordRouteSchema = typeof resetPasswordSchema;

export const createResetPasswordHandler = (
  options: CreateResetPasswordHandlerOptions = {},
): ValidatedRouteHandler<ResetPasswordRouteSchema> => {
  const authResetPasswordService =
    options.resetPasswordService ?? resetPasswordService;

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

export const resetPasswordHandler = createResetPasswordHandler();
