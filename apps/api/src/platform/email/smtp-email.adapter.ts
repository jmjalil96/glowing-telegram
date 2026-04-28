import nodemailer, { type SendMailOptions } from "nodemailer";
import type { Logger } from "pino";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import type {
  EmailMessage,
  EmailSendResult,
  EmailServiceDefaults,
} from "./email.port.js";

interface EmailTransport {
  sendMail(mailOptions: SendMailOptions): Promise<unknown>;
  verify(): Promise<true>;
}

type EmailLogger = Pick<Logger, "error" | "info">;

interface CreateEmailServiceOptions {
  transport?: EmailTransport;
  logger?: EmailLogger;
  defaults?: EmailServiceDefaults;
}

interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
  verifyConnection(): Promise<void>;
}

const createSmtpTransport = () =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER !== undefined && env.SMTP_PASSWORD !== undefined
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          }
        : undefined,
  });

const isAddressObject = (value: unknown): value is { address: string } =>
  typeof value === "object" &&
  value !== null &&
  "address" in value &&
  typeof value.address === "string";

const normalizeAddresses = (addresses: unknown): string[] => {
  if (!Array.isArray(addresses)) {
    return [];
  }

  return addresses
    .map((address) => {
      if (typeof address === "string") {
        return address;
      }

      if (isAddressObject(address)) {
        return address.address;
      }

      return undefined;
    })
    .filter((address): address is string => address !== undefined);
};

const normalizeSendResult = (info: unknown): EmailSendResult => {
  const result: Record<string, unknown> =
    typeof info === "object" && info !== null
      ? (info as Record<string, unknown>)
      : {};
  const messageId = result["messageId"];
  const accepted = result["accepted"];
  const rejected = result["rejected"];
  const response = result["response"];

  return {
    messageId:
      typeof messageId === "string" && messageId.length > 0 ? messageId : "",
    accepted: normalizeAddresses(accepted),
    rejected: normalizeAddresses(rejected),
    response: typeof response === "string" ? response : "",
  };
};

const assertMessageBody = (message: EmailMessage): void => {
  if (message.text !== undefined || message.html !== undefined) {
    return;
  }

  throw new Error("Email message must include text or html content");
};

const buildMailOptions = (
  message: EmailMessage,
  defaults: EmailServiceDefaults,
): SendMailOptions => {
  const replyTo = message.replyTo ?? defaults.replyTo;

  return {
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    from: message.from ?? defaults.from,
    ...(replyTo !== undefined ? { replyTo } : {}),
  };
};

export const createEmailService = (
  options: CreateEmailServiceOptions = {},
): EmailService => {
  const transport = options.transport ?? createSmtpTransport();
  const emailLogger = options.logger ?? logger;
  const defaults: EmailServiceDefaults = {
    from: options.defaults?.from ?? env.EMAIL_FROM,
  };
  const defaultReplyTo = options.defaults?.replyTo ?? env.EMAIL_REPLY_TO;

  if (defaultReplyTo !== undefined) {
    defaults.replyTo = defaultReplyTo;
  }

  return {
    send: async (message) => {
      assertMessageBody(message);

      const mailOptions = buildMailOptions(message, defaults);

      try {
        const info = await transport.sendMail(mailOptions);
        const result = normalizeSendResult(info);

        emailLogger.info(
          {
            messageId: result.messageId,
            to: message.to,
            subject: message.subject,
          },
          "Email sent",
        );

        return result;
      } catch (error) {
        emailLogger.error(
          {
            err: error,
            to: message.to,
            subject: message.subject,
          },
          "Email send failed",
        );

        throw error;
      }
    },
    verifyConnection: async () => {
      await transport.verify();
    },
  };
};

export type { EmailService, EmailTransport };

export const emailService = createEmailService();
