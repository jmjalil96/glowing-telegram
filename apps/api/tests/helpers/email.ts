import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

interface EmailBody {
  text?: string;
  html?: string;
}

export interface CapturedEmail {
  mailbox: string;
  id: string;
  subject: string;
  body: EmailBody;
}

export interface TestEmailSink {
  smtpHost: string;
  smtpPort: number;
  httpBaseUrl: string;
  purgeMailbox: (mailbox: string) => Promise<void>;
  waitForLatestMessage: (
    mailbox: string,
    options?: {
      afterMessageId?: string;
      timeoutMs?: number;
    },
  ) => Promise<CapturedEmail>;
  expectNoMessage: (mailbox: string, timeoutMs?: number) => Promise<void>;
  extractResetUrl: (message: Pick<CapturedEmail, "body">) => URL;
  extractResetToken: (message: Pick<CapturedEmail, "body">) => string;
  stop: () => Promise<void>;
}

const SMTP_PORT = 2500;
const HTTP_PORT = 9000;
const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getLatestMessageUrl = (httpBaseUrl: string, mailbox: string): string =>
  `${httpBaseUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}/latest`;

const fetchLatestMessage = async (
  httpBaseUrl: string,
  mailbox: string,
): Promise<CapturedEmail | null> => {
  const response = await fetch(getLatestMessageUrl(httpBaseUrl, mailbox), {
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Unexpected Inbucket response ${response.status} for mailbox ${mailbox}`,
    );
  }

  const message = (await response.json()) as CapturedEmail;

  return message;
};

const extractFirstUrl = (content: string): URL | null => {
  const match = content.match(/https?:\/\/[^\s"'<>]+/);

  if (!match) {
    return null;
  }

  try {
    return new URL(match[0]);
  } catch {
    return null;
  }
};

const getMessageBodyContent = (
  message: Pick<CapturedEmail, "body">,
): string[] =>
  [message.body.text, message.body.html].filter(
    (content): content is string =>
      typeof content === "string" && content.length > 0,
  );

export const mailboxNameFromEmail = (email: string): string => {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    throw new Error(`Invalid email address for mailbox lookup: ${email}`);
  }

  return email.slice(0, atIndex);
};

export const startTestEmailSink = async (): Promise<TestEmailSink> => {
  const container: StartedTestContainer = await new GenericContainer(
    "inbucket/inbucket:latest",
  )
    .withExposedPorts(SMTP_PORT, HTTP_PORT)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const smtpHost = container.getHost();
  const smtpPort = container.getMappedPort(SMTP_PORT);
  const httpBaseUrl = `http://${container.getHost()}:${container.getMappedPort(HTTP_PORT)}`;

  return {
    smtpHost,
    smtpPort,
    httpBaseUrl,
    purgeMailbox: async (mailbox) => {
      await fetch(
        `${httpBaseUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}`,
        {
          method: "DELETE",
        },
      );
    },
    waitForLatestMessage: async (mailbox, options = {}) => {
      const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      while (Date.now() < deadline) {
        const message = await fetchLatestMessage(httpBaseUrl, mailbox);

        if (message && message.id !== options.afterMessageId) {
          return message;
        }

        await delay(POLL_INTERVAL_MS);
      }

      throw new Error(`Timed out waiting for email in mailbox ${mailbox}`);
    },
    expectNoMessage: async (mailbox, timeoutMs = 1_500) => {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const message = await fetchLatestMessage(httpBaseUrl, mailbox);

        if (message) {
          throw new Error(`Unexpected email found in mailbox ${mailbox}`);
        }

        await delay(POLL_INTERVAL_MS);
      }
    },
    extractResetUrl: (message) => {
      for (const content of getMessageBodyContent(message)) {
        const url = extractFirstUrl(content);

        if (url && url.searchParams.has("token")) {
          return url;
        }
      }

      throw new Error("Failed to locate reset URL in captured email");
    },
    extractResetToken: (message) => {
      const resetUrl = getMessageBodyContent(message)
        .map(extractFirstUrl)
        .find(
          (url): url is URL => url !== null && url.searchParams.has("token"),
        );

      if (!resetUrl) {
        throw new Error("Failed to locate reset token in captured email");
      }

      const token = resetUrl.searchParams.get("token");

      if (!token) {
        throw new Error("Failed to read reset token from captured email");
      }

      return token;
    },
    stop: async () => {
      await container.stop();
    },
  };
};
