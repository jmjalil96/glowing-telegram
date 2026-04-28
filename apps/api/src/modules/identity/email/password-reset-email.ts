import { env } from "../../../platform/config/env.js";
import type { EmailMessage } from "../../../platform/email/index.js";
import {
  AUTH_PASSWORD_RESET_TOKEN_TTL_MS,
  AUTH_RESET_PASSWORD_PATH,
} from "../domain/identity-constants.js";

interface BuildPasswordResetEmailOptions {
  to: string;
  token: string;
}

const PASSWORD_RESET_EXPIRY_MINUTES = Math.round(
  AUTH_PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000),
);

const buildResetPasswordUrl = (token: string): string => {
  const resetUrl = new URL(AUTH_RESET_PASSWORD_PATH, env.WEB_APP_URL);

  resetUrl.searchParams.set("token", token);

  return resetUrl.toString();
};

export const buildPasswordResetEmail = ({
  to,
  token,
}: BuildPasswordResetEmailOptions): EmailMessage => {
  const resetUrl = buildResetPasswordUrl(token);
  const subject = "Reset your Tech Bros password";
  const text = [
    "We received a request to reset your password.",
    "",
    "Use this link to set a new password:",
    resetUrl,
    "",
    `This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = [
    "<p>We received a request to reset your password.</p>",
    `<p><a href="${resetUrl}">Reset your password</a></p>`,
    `<p>This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p>`,
    "<p>If you did not request this, you can ignore this email.</p>",
  ].join("");

  return {
    to,
    subject,
    text,
    html,
  };
};

export { buildResetPasswordUrl };
