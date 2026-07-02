import { webhookEvents } from "@giromesa/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type WebhookInput = {
  provider: string;
  externalEventId: string;
  tenantId?: string | undefined;
  payload: Record<string, unknown>;
};

@Injectable()
export class WebhooksService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async accept(input: WebhookInput) {
    const [event] = await this.database.db
      .insert(webhookEvents)
      .values({
        provider: input.provider,
        externalEventId: input.externalEventId,
        tenantId: input.tenantId,
        payload: input.payload,
        status: "received",
      })
      .onConflictDoNothing()
      .returning();

    return {
      accepted: true,
      duplicate: !event,
      provider: input.provider,
      externalEventId: input.externalEventId,
      queue:
        input.provider === "asaas"
          ? "asaas-webhooks"
          : input.provider === "meta_whatsapp"
            ? "messaging-events"
            : "outbox-events",
      idempotency: "provider_external_event_id",
    };
  }
}
