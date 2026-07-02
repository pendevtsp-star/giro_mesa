import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import type { HeaderRecord } from "../../common/http";
import { firstHeader } from "../../common/http";
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
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post("asaas")
  receiveAsaas(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    return this.webhooksService.accept({
      provider: "asaas",
      externalEventId: eventId(headers, "asaas", body),
      payload: bodyRecord(body),
    });
  }

  @Post("meta")
  receiveMeta(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    return this.webhooksService.accept({
      provider: "meta_whatsapp",
      externalEventId: eventId(headers, "meta", body),
      payload: bodyRecord(body),
    });
  }

  @Post("ifood")
  receiveIfood(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    return this.webhooksService.accept({
      provider: "ifood",
      externalEventId: eventId(headers, "ifood", body),
      payload: bodyRecord(body),
    });
  }
}
