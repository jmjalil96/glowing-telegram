import type { Request } from "express";

const consume = (..._values: unknown[]): void => undefined;

declare const req: Request;

consume(req.auth);

if (req.auth) {
  req.auth.userId.toUpperCase();
  req.auth.tenantId.toUpperCase();
  req.auth.email.toLowerCase();
  consume(req.auth.displayName?.toUpperCase());
  consume(req.auth.emailVerifiedAt?.toISOString());
  req.auth.sessionId.toUpperCase();

  // @ts-expect-error auth context must not expose password data
  consume(req.auth.passwordHash);
}
