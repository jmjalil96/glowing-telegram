import { describe, expect, it, vi } from "vitest";

import { createEmailService } from "../../../../src/services/email/smtp-email.service.js";
import type {
  EmailMessage,
  EmailSendResult,
} from "../../../../src/services/email/types.js";

type CreateEmailServiceOptions = NonNullable<
  Parameters<typeof createEmailService>[0]
>;
type TestEmailTransport = NonNullable<CreateEmailServiceOptions["transport"]>;
type TestEmailLogger = NonNullable<CreateEmailServiceOptions["logger"]>;

const createTransport = (): {
  transport: TestEmailTransport;
  sendMail: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
} => {
  const sendMail = vi.fn();
  const verify = vi.fn();

  return {
    transport: {
      sendMail,
      verify,
    },
    sendMail,
    verify,
  };
};

const createLogger = (): TestEmailLogger => ({
  info: vi.fn(),
  error: vi.fn(),
});

const sentMessage: EmailSendResult = {
  messageId: "smtp-message-123",
  accepted: ["hello@techbros.test"],
  rejected: [],
  response: "250 OK",
};

describe("createEmailService", () => {
  it("maps a valid message into sendMail and uses default sender settings", async () => {
    const { transport, sendMail } = createTransport();
    const logger = createLogger();

    sendMail.mockResolvedValue({
      messageId: sentMessage.messageId,
      accepted: sentMessage.accepted,
      rejected: sentMessage.rejected,
      response: sentMessage.response,
    });

    const service = createEmailService({
      transport,
      logger,
      defaults: {
        from: "no-reply@techbros.test",
        replyTo: "support@techbros.test",
      },
    });
    const message: EmailMessage = {
      to: "hello@techbros.test",
      subject: "Welcome",
      text: "Hello world",
    };

    const result = await service.send(message);

    expect(sendMail).toHaveBeenCalledWith({
      to: "hello@techbros.test",
      subject: "Welcome",
      text: "Hello world",
      html: undefined,
      from: "no-reply@techbros.test",
      replyTo: "support@techbros.test",
    });
    expect(result).toEqual(sentMessage);
    expect(logger.info).toHaveBeenCalledWith(
      {
        messageId: "smtp-message-123",
        to: "hello@techbros.test",
        subject: "Welcome",
      },
      "Email sent",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("allows per-message sender overrides", async () => {
    const { transport, sendMail } = createTransport();

    sendMail.mockResolvedValue({
      messageId: sentMessage.messageId,
      accepted: sentMessage.accepted,
      rejected: sentMessage.rejected,
      response: sentMessage.response,
    });

    const service = createEmailService({
      transport,
      logger: createLogger(),
      defaults: {
        from: "no-reply@techbros.test",
        replyTo: "support@techbros.test",
      },
    });

    await service.send({
      to: "hello@techbros.test",
      subject: "Welcome",
      html: "<p>Hello world</p>",
      from: "marketing@techbros.test",
      replyTo: "sales@techbros.test",
    });

    expect(sendMail).toHaveBeenCalledWith({
      to: "hello@techbros.test",
      subject: "Welcome",
      text: undefined,
      html: "<p>Hello world</p>",
      from: "marketing@techbros.test",
      replyTo: "sales@techbros.test",
    });
  });

  it("rejects messages without text or html content", async () => {
    const { transport, sendMail } = createTransport();
    const service = createEmailService({
      transport,
      logger: createLogger(),
      defaults: {
        from: "no-reply@techbros.test",
      },
    });

    await expect(
      service.send({
        to: "hello@techbros.test",
        subject: "Welcome",
      }),
    ).rejects.toThrow("Email message must include text or html content");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("propagates transport failures and logs them", async () => {
    const { transport, sendMail } = createTransport();
    const logger = createLogger();
    const error = new Error("smtp offline");

    sendMail.mockRejectedValue(error);

    const service = createEmailService({
      transport,
      logger,
      defaults: {
        from: "no-reply@techbros.test",
      },
    });

    await expect(
      service.send({
        to: "hello@techbros.test",
        subject: "Welcome",
        text: "Hello world",
      }),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: error,
        to: "hello@techbros.test",
        subject: "Welcome",
      },
      "Email send failed",
    );
  });

  it("verifies the underlying SMTP connection", async () => {
    const { transport, verify } = createTransport();

    verify.mockResolvedValue(true);

    const service = createEmailService({
      transport,
      logger: createLogger(),
      defaults: {
        from: "no-reply@techbros.test",
      },
    });

    await service.verifyConnection();

    expect(verify).toHaveBeenCalledTimes(1);
  });
});
