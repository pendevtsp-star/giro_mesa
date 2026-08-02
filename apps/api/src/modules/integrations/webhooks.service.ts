import {
  deliveryOrders,
  purchaseIntents,
  subscriptions,
  tenants,
  webhookEvents,
} from "@giromesa/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { createWhatsAppProvider } from "../../common/whatsapp-provider";
import { DatabaseService } from "../database/database.service";
import { IfoodProvider } from "./ifood-provider";

export type WebhookInput = {
  provider: string;
  externalEventId: string;
  tenantId?: string | undefined;
  payload: Record<string, unknown>;
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IfoodProvider) readonly _ifoodProvider: IfoodProvider,
  ) {}

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

    if (event && input.provider === "meta_whatsapp") {
      await this.processMetaWhatsAppEvent(event.id, input.payload);
    }

    if (event && input.provider === "ifood") {
      await this.processIfoodEvent(event.id, input.payload);
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
            : input.provider === "ifood"
              ? "delivery-events"
              : "outbox-events",
      idempotency: "provider_external_event_id",
    };
  }

  private async processMetaWhatsAppEvent(webhookEventId: string, payload: Record<string, unknown>) {
    const provider = createWhatsAppProvider();
    const incomingMessages = provider.parseIncomingPayload(payload);

    if (incomingMessages.length === 0) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    for (const message of incomingMessages) {
      console.log("whatsapp incoming message", {
        webhookEventId,
        from: message.from,
        type: message.type,
        messageId: message.messageId,
      });
    }

    await this.markWebhookProcessed(webhookEventId, "processed");
  }

  private async processAsaasEvent(webhookEventId: string, payload: Record<string, unknown>) {
    const eventName = this.readEventName(payload);
    const reference = this.readExternalReference(payload);
    const tenantSlug = readReferenceTenantSlug(reference);
    const purchaseIntentId = readReferencePurchaseIntentId(reference);

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

    const nextPurchaseIntentStatus = mapAsaasEventToPurchaseIntentStatus(eventName);
    if (purchaseIntentId && nextPurchaseIntentStatus) {
      await this.database.db
        .update(purchaseIntents)
        .set({ status: nextPurchaseIntentStatus, updatedAt: new Date() })
        .where(eq(purchaseIntents.id, purchaseIntentId));
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

  private async processIfoodEvent(webhookEventId: string, payload: Record<string, unknown>) {
    const eventType = payload.event as string | undefined;
    const orderId = payload.orderId as string | undefined;

    if (!eventType || !orderId) {
      this.logger.warn("iFood webhook missing eventType or orderId", { webhookEventId });
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    const statusMap: Record<string, string> = {
      PLACED: "confirmed",
      CONFIRMED: "confirmed",
      STARTED: "preparing",
      READY_TO_WITHDRAW: "ready_for_pickup",
      DISPATCHED: "out_for_delivery",
      CONCLUDED: "delivered",
      CANCELED: "canceled",
    };

    const mappedStatus = statusMap[eventType];
    if (!mappedStatus) {
      this.logger.debug(`iFood event type "${eventType}" not mapped to delivery status`, {
        webhookEventId,
      });
      await this.markWebhookProcessed(webhookEventId, "processed");
      return;
    }

    const [delivery] = await this.database.db
      .select()
      .from(deliveryOrders)
      .where(eq(deliveryOrders.orderId, orderId))
      .limit(1);

    if (!delivery) {
      this.logger.debug(`No delivery order found for iFood orderId ${orderId}`, {
        webhookEventId,
      });
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    await this.database.db
      .update(deliveryOrders)
      .set({
        status: mappedStatus as
          | "pending"
          | "confirmed"
          | "preparing"
          | "ready_for_pickup"
          | "out_for_delivery"
          | "delivered"
          | "canceled",
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrders.id, delivery.id));

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
  const slug = reference
    .slice("gm-sub-".length)
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "")
    .replace(/-\d+$/, "");
  return slug || null;
}

function readReferencePurchaseIntentId(reference: string | null) {
  const match = reference?.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  return match?.[1] ?? null;
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

function mapAsaasEventToPurchaseIntentStatus(eventName: string) {
  if (eventName === "PAYMENT_CONFIRMED" || eventName === "PAYMENT_RECEIVED") {
    return "completed";
  }
  if (eventName === "PAYMENT_OVERDUE") {
    return "past_due";
  }
  if (eventName === "PAYMENT_DELETED" || eventName === "PAYMENT_REFUNDED") {
    return "canceled";
  }
  if (eventName === "PAYMENT_RESTORED") {
    return "pending";
  }
  return null;
}
