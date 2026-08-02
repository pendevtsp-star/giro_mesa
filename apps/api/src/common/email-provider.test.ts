import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmailProvider,
  MockEmailProvider,
  ResendEmailProvider,
  SmtpEmailProvider,
} from "./email-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("email provider selection", () => {
  it("uses the mock outside production when SMTP is not configured", () => {
    process.env.NODE_ENV = "test";
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SMTP_HOST;
    delete process.env.EMAIL_FROM;

    expect(createEmailProvider()).toBeInstanceOf(MockEmailProvider);
  });

  it("rejects placeholder SMTP configuration in production", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.EMAIL_FROM = "no-reply@giromesa.com.br";
    process.env.SMTP_USER = "no-reply@giromesa.com.br";
    process.env.SMTP_PASSWORD = "not-a-real-secret";

    expect(() => createEmailProvider()).toThrow(/real SMTP_HOST/);
  });

  it("requires authenticated SMTP in production", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.giromesa.com.br";
    process.env.EMAIL_FROM = "no-reply@giromesa.com.br";
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    expect(() => createEmailProvider()).toThrow(/SMTP_USER and SMTP_PASSWORD/);
  });

  it("selects SMTP when production configuration is complete", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.giromesa.com.br";
    process.env.EMAIL_FROM = "no-reply@giromesa.com.br";
    process.env.SMTP_USER = "no-reply@giromesa.com.br";
    process.env.SMTP_PASSWORD = "not-a-real-secret";

    expect(createEmailProvider()).toBeInstanceOf(SmtpEmailProvider);
  });

  it("sends through Resend with an idempotency key", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_FROM = "no-reply@giromesa.com.br";
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(ResendEmailProvider);
    await expect(
      provider.send({
        to: "qa@example.test",
        subject: "Teste GiroMesa",
        text: "Teste",
        html: "<p>Teste</p>",
      }),
    ).resolves.toEqual({ provider: "resend", messageId: "email_123", queued: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "Idempotency-Key": expect.stringMatching(/^resend-/),
        }),
      }),
    );
  });
});
