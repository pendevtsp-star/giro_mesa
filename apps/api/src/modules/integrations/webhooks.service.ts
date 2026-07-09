import { subscriptions, tenants, webhookEvents } from "@giromesa/db";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
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

    if (event && input.provider === "asaas") {
      await this.processAsaasEvent(event.id, input.payload);
    }

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

  private async processAsaasEvent(webhookEventId: string, payload: Record<string, unknown>) {
    const eventName = this.readEventName(payload);
    const reference = this.readExternalReference(payload);
    const tenantSlug = readReferenceTenantSlug(reference);

    if (!eventName || !tenantSlug) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    const [tenant] = await this.database.db
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    const nextStatus = mapAsaasEventToTenantStatus(eventName);
    if (!nextStatus) {
      await this.markWebhookProcessed(webhookEventId, "processed");
      return;
    }

    await this.database.db
      .update(tenants)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));

    await this.database.db
      .update(subscriptions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenant.id));

    await this.markWebhookProcessed(webhookEventId, "processed");
  }

  private async markWebhookProcessed(webhookEventId: string, status: "processed" | "ignored") {
    await this.database.db
      .update(webhookEvents)
      .set({
        status,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, webhookEventId));
  }

  private readEventName(payload: Record<string, unknown>) {
    const value = payload.event;
    return typeof value === "string" ? value.toUpperCase() : null;
  }

  private readExternalReference(payload: Record<string, unknown>) {
    const direct = payload.externalReference;
    if (typeof direct === "string" && direct.length > 0) {
      return direct;
    }
    const payment = payload.payment;
    if (payment && typeof payment === "object" && !Array.isArray(payment)) {
      const nested = (payment as Record<string, unknown>).externalReference;
      if (typeof nested === "string" && nested.length > 0) {
        return nested;
      }
    }
    return null;
  }
}

function readReferenceTenantSlug(reference: string | null) {
  if (!reference?.startsWith("gm-sub-")) {
    return null;
  }
  const slug = reference.slice("gm-sub-".length).replace(/-\d+$/, "");
  return slug || null;
}

function mapAsaasEventToTenantStatus(eventName: string) {
  if (eventName === "PAYMENT_CONFIRMED" || eventName === "PAYMENT_RECEIVED") {
    return "active";
  }
  if (eventName === "PAYMENT_OVERDUE") {
    return "past_due";
  }
  if (eventName === "PAYMENT_DELETED" || eventName === "PAYMENT_REFUNDED") {
    return "suspended";
  }
  if (eventName === "PAYMENT_RESTORED") {
    return "trial";
  }
  return null;
}
