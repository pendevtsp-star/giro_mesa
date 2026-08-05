import { randomUUID } from "node:crypto";
import { safeFetch, UnsafeOutboundUrlError } from "@giromesa/config";
import nodemailer from "nodemailer";
import { sanitizeErrorMessage } from "./sensitive-data";

export type EmailMessage = {
  tenantId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDelivery = {
  provider: "mock" | "smtp" | "resend";
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
const RESEND_API_URL = "https://api.resend.com";
const RESEND_RETRY_ATTEMPTS = 3;
const RESEND_RETRY_DELAY_MS = 1000;
const RESEND_TIMEOUT_MS = 10_000;

class ResendPermanentError extends Error {}

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

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly request: typeof safeFetch = safeFetch) {}

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const apiKey = requiredEnv("RESEND_API_KEY");
    const from = requiredEnv("EMAIL_FROM");
    const endpoint = `${(process.env.RESEND_API_URL ?? RESEND_API_URL).replace(/\/+$/, "")}/emails`;
    const idempotencyKey = `resend-${randomUUID()}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= RESEND_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await this.request(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
        const rawBody = await response.text();
        const body = parseResendResponse(rawBody);

        if (response.ok && body.id) {
          return {
            provider: "resend",
            messageId: body.id,
            queued: true,
          };
        }

        const error = new Error(
          `Resend delivery failed (${response.status}): ${body.message ?? "unknown error"}`,
        );
        if (response.status !== 429 && response.status < 500) {
          throw new ResendPermanentError(error.message);
        }
        lastError = error;
      } catch (error) {
        if (error instanceof ResendPermanentError) {
          throw error;
        }
        if (error instanceof UnsafeOutboundUrlError) {
          throw new ResendPermanentError(error.message);
        }
        lastError = error;
      }

      if (attempt < RESEND_RETRY_ATTEMPTS) {
        await sleep(RESEND_RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error(
      `Resend delivery failed after ${RESEND_RETRY_ATTEMPTS} attempts: ${formatError(lastError)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  return sanitizeErrorMessage(error);
}

export function createEmailProvider() {
  const provider = process.env.EMAIL_PROVIDER ?? "smtp";
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (apiKey && from) {
      return new ResendEmailProvider();
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Resend provider requires RESEND_API_KEY and EMAIL_FROM in production");
    }
  }

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const hasAuth = Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD);
    if (
      host &&
      from &&
      !isPlaceholderSmtpHost(host) &&
      (process.env.NODE_ENV !== "production" || hasAuth)
    ) {
      return new SmtpEmailProvider();
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SMTP provider requires a real SMTP_HOST, EMAIL_FROM, SMTP_USER and SMTP_PASSWORD in production",
      );
    }
  }

  return new MockEmailProvider();
}

function parseResendResponse(rawBody: string): { id?: string; message?: string } {
  try {
    const body = JSON.parse(rawBody) as { id?: unknown; message?: unknown; name?: unknown };
    return {
      ...(typeof body.id === "string" ? { id: body.id } : {}),
      ...(typeof body.message === "string"
        ? { message: body.message }
        : typeof body.name === "string"
          ? { message: body.name }
          : {}),
    };
  } catch {
    return { message: "invalid provider response" };
  }
}

function isPlaceholderSmtpHost(host: string | undefined) {
  return (
    !host ||
    host === "smtp.example.com" ||
    host.endsWith(".example.com") ||
    host.endsWith(".invalid") ||
    host.endsWith(".test")
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
