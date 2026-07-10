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
  });

  async send(message: EmailMessage): Promise<EmailDelivery> {
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
  }
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
