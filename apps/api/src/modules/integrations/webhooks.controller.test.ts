import { createHmac } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeaderRecord } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { WebhooksController } from "./webhooks.controller";
import type { WebhooksService } from "./webhooks.service";

const productionEnv = {
  NODE_ENV: "production",
  APP_URL: "https://giromesa.com.br",
  PUBLIC_APP_URL: "https://giromesa.com.br",
  API_URL: "https://giromesa.com.br",
  DATABASE_URL: "postgres://giromesa:secret@db:5432/giromesa",
  REDIS_URL: "redis://redis:6379",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  PASSWORD_PEPPER: "0123456789abcdef0123456789abcdef-pepper",
  MFA_SECRET_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef-mfa",
} satisfies NodeJS.ProcessEnv;

function buildController() {
  const service = {
    accept: vi.fn(async (input) => ({
      accepted: true,
      duplicate: false,
      provider: input.provider,
      externalEventId: input.externalEventId,
      queue: "outbox-events",
      idempotency: "provider_external_event_id",
    })),
  } satisfies Pick<WebhooksService, "accept">;

  return {
    controller: new WebhooksController(
      service as unknown as WebhooksService,
      new RateLimitService(),
    ),
    service,
  };
}

describe("WebhooksController production safety", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("requires the Asaas webhook secret in production", () => {
    process.env = { ...productionEnv };
    const { controller } = buildController();

    return expect(
      controller.receiveAsaas({ id: "evt-1" }, { "x-forwarded-for": "203.0.113.1" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts Asaas only with the configured secret", async () => {
    process.env = { ...productionEnv, ASAAS_WEBHOOK_SECRET: "asaas-secret" };
    const { controller, service } = buildController();
    const headers: HeaderRecord = {
      "x-forwarded-for": "203.0.113.2",
      "asaas-access-token": "asaas-secret",
    };

    await expect(controller.receiveAsaas({ id: "evt-2" }, headers)).resolves.toMatchObject({
      accepted: true,
      provider: "asaas",
    });
    expect(service.accept).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "asaas", externalEventId: "evt-2" }),
    );
  });

  it("validates Meta x-hub-signature-256 against the raw body", async () => {
    const rawBody = Buffer.from(JSON.stringify({ id: "meta-event" }));
    const signature = `sha256=${createHmac("sha256", "meta-secret").update(rawBody).digest("hex")}`;
    process.env = { ...productionEnv, META_APP_SECRET: "meta-secret" };
    const { controller } = buildController();

    await expect(
      controller.receiveMeta(
        { id: "meta-event" },
        { "x-forwarded-for": "203.0.113.3", "x-hub-signature-256": signature },
        { rawBody } as never,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      provider: "meta_whatsapp",
    });
  });

  it("rejects Meta with an invalid signature", () => {
    process.env = { ...productionEnv, META_APP_SECRET: "meta-secret" };
    const { controller } = buildController();

    return expect(
      controller.receiveMeta(
        { id: "meta-event" },
        { "x-forwarded-for": "203.0.113.4", "x-hub-signature-256": "sha256=invalid" },
        { rawBody: Buffer.from("{}") } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("blocks iFood production traffic unless sandbox mode is explicitly enabled", () => {
    process.env = { ...productionEnv, IFOOD_WEBHOOK_MODE: "disabled" };
    const { controller } = buildController();

    return expect(
      controller.receiveIfood({ id: "ifood-event" }, { "x-forwarded-for": "203.0.113.5" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
