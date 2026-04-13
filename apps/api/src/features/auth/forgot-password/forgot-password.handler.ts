import type { ValidatedRouteHandler } from "../../../types/validated-request.js";
import { buildAuditContext } from "../../../services/audit/index.js";
import type { forgotPasswordSchema } from "./forgot-password.schema.js";
import {
  forgotPasswordService,
  type ForgotPasswordParams,
} from "./forgot-password.service.js";

interface CreateForgotPasswordHandlerOptions {
  forgotPasswordService?: Pick<typeof forgotPasswordService, "forgotPassword">;
}

type ForgotPasswordRouteSchema = typeof forgotPasswordSchema;

export const createForgotPasswordHandler = (
  options: CreateForgotPasswordHandlerOptions = {},
): ValidatedRouteHandler<ForgotPasswordRouteSchema> => {
  const authForgotPasswordService =
    options.forgotPasswordService ?? forgotPasswordService;

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

export const forgotPasswordHandler = createForgotPasswordHandler();
