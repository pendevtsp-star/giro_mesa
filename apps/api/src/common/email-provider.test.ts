import {
  SafeHttpClient,
  type SafeHttpResolver,
  SafeHttpResponse,
  type SafeHttpTransport,
} from "@giromesa/config";
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
    const requestMock = vi.fn(async () =>
      Promise.resolve(
        new SafeHttpResponse(
          200,
          "OK",
          { "content-type": "application/json" },
          Buffer.from(JSON.stringify({ id: "email_123" })),
        ),
      ),
    );

    expect(createEmailProvider()).toBeInstanceOf(ResendEmailProvider);
    const provider = new ResendEmailProvider(requestMock);
    await expect(
      provider.send({
        to: "qa@example.test",
        subject: "Teste GiroMesa",
        text: "Teste",
        html: "<p>Teste</p>",
      }),
    ).resolves.toEqual({ provider: "resend", messageId: "email_123", queued: true });

    expect(requestMock).toHaveBeenCalledWith(
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

  it("blocks unsafe destinations and pins the validated address in the production caller", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_FROM = "no-reply@giromesa.com.br";
    process.env.RESEND_API_KEY = "re_test_key";
    const message = {
      to: "qa@example.test",
      subject: "Teste GiroMesa",
      text: "Teste",
      html: "<p>Teste</p>",
    };

    for (const endpoint of [
      "https://127.0.0.1",
      "https://10.0.0.1",
      "https://169.254.169.254",
      "https://[::1]",
      "https://[fd00::1]",
      "https://[fe80::1]",
      "https://[::ffff:7f00:1]",
    ]) {
      process.env.RESEND_API_URL = endpoint;
      await expect(new ResendEmailProvider().send(message), endpoint).rejects.toThrow(
        /resolves to a private address/,
      );
    }

    process.env.RESEND_API_URL = "https://resend.example.test";
    const mixedResolver: SafeHttpResolver = async () => [
      { address: "203.0.113.10", family: 4 },
      { address: "10.0.0.2", family: 4 },
    ];
    const unusedTransport = vi.fn<SafeHttpTransport>();
    const mixedClient = new SafeHttpClient(mixedResolver, unusedTransport);
    await expect(
      new ResendEmailProvider(mixedClient.fetch.bind(mixedClient)).send(message),
    ).rejects.toThrow(/private address/);
    expect(unusedTransport).not.toHaveBeenCalled();

    const redirectTransport = vi.fn<SafeHttpTransport>(async () => ({
      status: 302,
      statusText: "Found",
      headers: { location: "https://127.0.0.1/internal" },
      body: Buffer.alloc(0),
    }));
    const publicResolver: SafeHttpResolver = async () => [{ address: "203.0.113.11", family: 4 }];
    const redirectClient = new SafeHttpClient(publicResolver, redirectTransport);
    await expect(
      new ResendEmailProvider(redirectClient.fetch.bind(redirectClient)).send(message),
    ).rejects.toThrow(/private address/);
    expect(redirectTransport).toHaveBeenCalledTimes(1);

    const resolver = vi.fn<SafeHttpResolver>(async () => [{ address: "203.0.113.12", family: 4 }]);
    const pinnedTransport = vi.fn<SafeHttpTransport>(async (request) => {
      expect(request.address).toEqual({ address: "203.0.113.12", family: 4 });
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ id: "email_pinned" })),
      };
    });
    const pinnedClient = new SafeHttpClient(resolver, pinnedTransport);
    await expect(
      new ResendEmailProvider(pinnedClient.fetch.bind(pinnedClient)).send(message),
    ).resolves.toMatchObject({ messageId: "email_pinned" });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
