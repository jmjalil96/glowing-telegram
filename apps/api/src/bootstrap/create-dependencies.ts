import type { Router } from "express";

import { createForgotPasswordService } from "../modules/identity/application/forgot-password.use-case.js";
import { createLoginService } from "../modules/identity/application/login.use-case.js";
import { createLogoutService } from "../modules/identity/application/logout.use-case.js";
import { createResetPasswordService } from "../modules/identity/application/reset-password.use-case.js";
import { createSessionAuthService } from "../modules/identity/application/resolve-request-auth.use-case.js";
import { createForgotPasswordHandler } from "../modules/identity/http/forgot-password.handler.js";
import {
  createLoadAuthMiddleware,
  requireAuthMiddleware,
} from "../modules/identity/http/auth.middleware.js";
import { createLoginHandler } from "../modules/identity/http/login.handler.js";
import { createLogoutHandler } from "../modules/identity/http/logout.handler.js";
import { createMeHandler } from "../modules/identity/http/me.handler.js";
import { createResetPasswordHandler } from "../modules/identity/http/reset-password.handler.js";
import { createIdentityRouter } from "../modules/identity/index.js";
import { createIdentityTransactionRunner } from "../modules/identity/infrastructure/identity-transaction.drizzle.js";
import { createPasswordResetTokenRepository } from "../modules/identity/infrastructure/password-reset-token.repository.drizzle.js";
import { createSessionRepository } from "../modules/identity/infrastructure/session.repository.drizzle.js";
import { createUserRepository } from "../modules/identity/infrastructure/user.repository.drizzle.js";
import { auditLogService } from "../platform/audit/index.js";
import { emailService } from "../platform/email/index.js";
import { logger } from "../platform/logger/logger.js";
import { opaqueTokenService } from "../platform/security/opaque-token.js";
import { passwordHasher } from "../platform/security/password-hasher.js";
import { createApiV1Router } from "../routes/api/v1/index.js";

interface ApiDependencies {
  apiV1Router: Router;
}

export const createDependencies = (): ApiDependencies => {
  const userRepository = createUserRepository();
  const sessionRepository = createSessionRepository();
  const passwordResetTokenRepository = createPasswordResetTokenRepository();
  const transactionRunner = createIdentityTransactionRunner();

  const loginService = createLoginService({
    auditRecorder: auditLogService,
    loginUserReader: userRepository,
    opaqueTokenIssuer: opaqueTokenService,
    passwordVerifier: passwordHasher,
    transactionRunner,
    warningLogger: logger,
  });
  const forgotPasswordService = createForgotPasswordService({
    activePasswordResetUserReader: userRepository,
    auditRecorder: auditLogService,
    emailSender: emailService,
    opaqueTokenIssuer: opaqueTokenService,
    passwordResetTokenWriter: passwordResetTokenRepository,
    transactionRunner,
    warningLogger: logger,
  });
  const resetPasswordService = createResetPasswordService({
    auditRecorder: auditLogService,
    opaqueTokenHasher: opaqueTokenService,
    passwordHashGenerator: passwordHasher,
    passwordResetTokenReader: passwordResetTokenRepository,
    transactionRunner,
    warningLogger: logger,
  });
  const logoutService = createLogoutService({
    auditRecorder: auditLogService,
    sessionWriter: sessionRepository,
    warningLogger: logger,
  });
  const sessionAuthService = createSessionAuthService({
    opaqueTokenHasher: opaqueTokenService,
    sessionAuthReader: sessionRepository,
  });

  const authRouter = createIdentityRouter({
    forgotPasswordHandler: createForgotPasswordHandler({
      forgotPasswordService,
    }),
    loadAuthMiddleware: createLoadAuthMiddleware({
      sessionAuthService,
    }),
    loginHandler: createLoginHandler({
      loginService,
    }),
    logoutHandler: createLogoutHandler({
      logoutService,
    }),
    meHandler: createMeHandler(),
    requireAuthMiddleware,
    resetPasswordHandler: createResetPasswordHandler({
      resetPasswordService,
    }),
  });

  return {
    apiV1Router: createApiV1Router({
      authRouter,
    }),
  };
};
