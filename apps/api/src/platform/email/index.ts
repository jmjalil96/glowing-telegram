export { createEmailService, emailService } from "./smtp-email.adapter.js";
export type {
  EmailMessage,
  EmailSendResult,
  EmailServiceDefaults,
} from "./email.port.js";
export type { EmailService, EmailTransport } from "./smtp-email.adapter.js";
