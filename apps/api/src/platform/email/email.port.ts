export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface EmailServiceDefaults {
  from: string;
  replyTo?: string;
}
