import nodemailer from "nodemailer";

export type EmailMessage = {
  tenantId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDelivery = {
  provider: "mock" | "smtp";
  messageId: string;
  queued: boolean;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailDelivery>;
}

export class MockEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailDelivery> {
    return {
      provider: "mock",
      messageId: `mock-email:${message.to}:${Date.now()}`,
      queued: true,
    };
  }
}

const SMTP_RETRY_ATTEMPTS = 3;
const SMTP_RETRY_DELAY_MS = 1000;

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  async send(message: EmailMessage): Promise<EmailDelivery> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SMTP_RETRY_ATTEMPTS; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: requiredEnv("EMAIL_FROM"),
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });

        return {
          provider: "smtp",
          messageId: info.messageId,
          queued: true,
        };
      } catch (error) {
        lastError = error;

        if (attempt < SMTP_RETRY_ATTEMPTS) {
          const delay = SMTP_RETRY_DELAY_MS * attempt;
          await sleep(delay);
        }
      }
    }

    throw new Error(
      `SMTP delivery failed after ${SMTP_RETRY_ATTEMPTS} attempts: ${formatError(lastError)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createEmailProvider() {
  const provider = process.env.EMAIL_PROVIDER ?? "mock";
  if (provider === "smtp") {
    if (
      process.env.SMTP_HOST &&
      process.env.EMAIL_FROM &&
      !isPlaceholderSmtpHost(process.env.SMTP_HOST)
    ) {
      return new SmtpEmailProvider();
    }

    if (process.env.NODE_ENV === "production" && !isPlaceholderSmtpHost(process.env.SMTP_HOST)) {
      throw new Error("SMTP provider selected but SMTP_HOST or EMAIL_FROM is missing");
    }
  }

  return new MockEmailProvider();
}

function isPlaceholderSmtpHost(host: string | undefined) {
  return !host || host === "smtp.example.com" || host.endsWith(".example.com");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
