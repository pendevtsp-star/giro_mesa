import { loadEnv } from "@giromesa/config";
import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { HeaderRecord } from "../../common/http";
import { firstHeader } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { verifyRawBodyHmacSignature, verifyWebhookSignature } from "../../common/webhook-signature";
import { WebhooksService } from "./webhooks.service";

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function eventId(headers: HeaderRecord, provider: string, body: unknown): string {
  const explicit = firstHeader(headers["x-webhook-id"]) ?? firstHeader(headers["x-event-id"]);
  if (explicit) {
    return explicit;
  }

  const payload = bodyRecord(body);
  if (typeof payload.id === "string") {
    return payload.id;
  }

  return `${provider}-${Date.now()}`;
}

@Controller("webhooks")
export class WebhooksController {
  constructor(
    @Inject(WebhooksService) private readonly webhooksService: WebhooksService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
  ) {}

  @Post("asaas")
  async receiveAsaas(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const env = loadEnv();
    this.rateLimitService.assertAllowed(headers, {
      namespace: "asaas_webhook",
      limit: 300,
      windowMs: 60_000,
    });

    if (env.NODE_ENV === "production" && !env.ASAAS_WEBHOOK_SECRET) {
      throw new UnauthorizedException("Webhook authentication is not configured");
    }

    const receivedSecret =
      firstHeader(headers["asaas-access-token"]) ??
      firstHeader(headers["x-asaas-webhook-secret"]) ??
      firstHeader(headers["asaas-webhook-secret"]);
    if (env.ASAAS_WEBHOOK_SECRET && receivedSecret !== env.ASAAS_WEBHOOK_SECRET) {
      throw new UnauthorizedException("Invalid webhook authentication");
    }

    return this.webhooksService.accept({
      provider: "asaas",
      externalEventId: eventId(headers, "asaas", body),
      payload: bodyRecord(body),
    });
  }

  @Post("meta")
  async receiveMeta(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    const env = loadEnv();
    this.rateLimitService.assertAllowed(headers, {
      namespace: "meta_webhook",
      limit: 300,
      windowMs: 60_000,
    });

    if (env.NODE_ENV === "production" && !env.META_APP_SECRET) {
      throw new UnauthorizedException("Webhook authentication is not configured");
    }

    if (
      env.META_APP_SECRET &&
      !verifyRawBodyHmacSignature({
        secret: env.META_APP_SECRET,
        signature: firstHeader(headers["x-hub-signature-256"]),
        rawBody: request.rawBody,
      })
    ) {
      throw new UnauthorizedException("Invalid webhook authentication");
    }

    return this.webhooksService.accept({
      provider: "meta_whatsapp",
      externalEventId: eventId(headers, "meta", body),
      payload: bodyRecord(body),
    });
  }

  @Post("ifood")
  async receiveIfood(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const env = loadEnv();
    this.rateLimitService.assertAllowed(headers, {
      namespace: "ifood_webhook",
      limit: 300,
      windowMs: 60_000,
    });

    if (env.NODE_ENV === "production" && env.IFOOD_WEBHOOK_MODE !== "sandbox") {
      throw new UnauthorizedException("iFood webhook is not enabled for production traffic");
    }

    return this.webhooksService.accept({
      provider: "ifood",
      externalEventId: eventId(headers, "ifood", body),
      payload: bodyRecord(body),
    });
  }

  @Post("club-whisky")
  receiveClubWhisky(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    this.rateLimitService.assertAllowed(headers, {
      namespace: "club_whisky_webhook",
      limit: 300,
      windowMs: 60_000,
    });

    const env = loadEnv();
    const payload = bodyRecord(body);
    const externalEventId = eventId(headers, "club_whisky", body);

    if (!env.CLUB_WHISKY_WEBHOOK_SECRET) {
      throw new UnauthorizedException("Club Whisky webhook secret is not configured");
    }

    const isValid = verifyWebhookSignature({
      secret: env.CLUB_WHISKY_WEBHOOK_SECRET,
      signature: firstHeader(headers["x-club-whisky-signature"]),
      timestamp: firstHeader(headers["x-club-whisky-timestamp"]),
      eventId: externalEventId,
      rawBody: request.rawBody,
    });

    if (!isValid) {
      throw new UnauthorizedException("Invalid Club Whisky webhook signature");
    }

    return this.webhooksService.accept({
      provider: "club_whisky",
      externalEventId,
      payload,
    });
  }
}
