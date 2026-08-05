import {
  deliveryOrders,
  purchaseIntents,
  subscriptions,
  tenants,
  webhookEvents,
} from "@giromesa/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { emailSuppressionKey } from "../../common/email-delivery";
import { sanitizeSensitiveData } from "../../common/sensitive-data";
import { createWhatsAppProvider } from "../../common/whatsapp-provider";
import { DatabaseService } from "../database/database.service";
import { IfoodProvider } from "./ifood-provider";
import { normalizeResendDeliveryEvent } from "./resend-events";

export type WebhookInput = {
  provider: string;
  externalEventId: string;
  tenantId?: string | undefined;
  payload: Record<string, unknown>;
};

export const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IfoodProvider) readonly _ifoodProvider: IfoodProvider,
  ) {}

  async accept(input: WebhookInput) {
    const persistedPayload = this.preparePayloadForPersistence(input.provider, input.payload);
    const staleProcessingBefore = new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS);
    const claim = await this.database.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(webhookEvents)
        .values({
          provider: input.provider,
          externalEventId: input.externalEventId,
          tenantId: input.tenantId,
          payload: persistedPayload,
          status: "received",
        })
        .onConflictDoNothing()
        .returning();
      const [candidate] = inserted
        ? [inserted]
        : await tx
            .select()
            .from(webhookEvents)
            .where(
              and(
                eq(webhookEvents.provider, input.provider),
                eq(webhookEvents.externalEventId, input.externalEventId),
              ),
            )
            .limit(1);
      if (!candidate) throw new Error("Persisted webhook event could not be loaded");
      const [claimed] = await tx
        .update(webhookEvents)
        .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
        .where(
          and(
            eq(webhookEvents.id, candidate.id),
            or(
              inArray(webhookEvents.status, ["received", "failed"]),
              and(
                eq(webhookEvents.status, "processing"),
                lte(webhookEvents.updatedAt, staleProcessingBefore),
              ),
            ),
          ),
        )
        .returning();
      return { event: claimed ?? candidate, claimed: Boolean(claimed), duplicate: !inserted };
    });

    const event = claim.event;
    if (!claim.claimed) return this.acceptedResponse(input, true);

    try {
      await this.processClaimedEvent(event.id, input.provider, event.payload);
    } catch (error) {
      await this.database.db
        .update(webhookEvents)
        .set({
          status: "failed",
          errorMessage: String(
            sanitizeSensitiveData(error instanceof Error ? error.message : error),
          ),
          updatedAt: new Date(),
        })
        .where(eq(webhookEvents.id, event.id));
      throw error;
    }

    return this.acceptedResponse(input, claim.duplicate);
  }

  private async processClaimedEvent(
    eventId: string,
    provider: string,
    payload: Record<string, unknown>,
  ) {
    if (provider === "asaas") await this.processAsaasEvent(eventId, payload);
    else if (provider === "meta_whatsapp") await this.processMetaWhatsAppEvent(eventId, payload);
    else if (provider === "ifood") await this.processIfoodEvent(eventId, payload);
    else if (provider === "resend") await this.processResendEvent(eventId, payload);
    else await this.markWebhookProcessed(eventId, "processed");
  }

  private acceptedResponse(input: WebhookInput, duplicate: boolean) {
    return {
      accepted: true,
      duplicate,
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
      this.logger.log(
        "whatsapp incoming message",
        sanitizeSensitiveData({
          webhookEventId,
          from: message.from,
          type: message.type,
          messageId: message.messageId,
        }),
      );
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

  private async processResendEvent(webhookEventId: string, payload: Record<string, unknown>) {
    const rawEvent = normalizeResendDeliveryEvent(payload);
    const eventType = rawEvent?.type ?? readPersistedResendEventType(payload);
    const status =
      rawEvent?.status ??
      (payload.status === "processed" || payload.status === "suppressed" ? payload.status : null);
    const suppressionKey = rawEvent?.recipient
      ? emailSuppressionKey(rawEvent.recipient)
      : typeof payload.suppressionKey === "string"
        ? payload.suppressionKey
        : null;
    if (!eventType || !status || (status === "suppressed" && !suppressionKey)) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    // The signed Resend ingress stays disabled until its provider contract is versioned.
    // This path is intentionally usable only by the local simulator through accept().
    await this.database.db.transaction(async (tx) => {
      if (suppressionKey) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${suppressionKey}))`);
      }
      await tx
        .update(webhookEvents)
        .set({
          status,
          payload: {
            eventType,
            suppressionKey,
            scope: "recipient",
          },
          processedAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(webhookEvents.id, webhookEventId));
    });
  }

  private preparePayloadForPersistence(provider: string, payload: Record<string, unknown>) {
    if (provider !== "resend") return payload;
    const event = normalizeResendDeliveryEvent(payload);
    if (!event) {
      return {
        eventType: typeof payload.type === "string" ? payload.type : "unknown",
        status: "ignored",
        scope: "recipient",
        suppressionKey: null,
      };
    }
    return {
      eventType: event.type,
      status: event.status,
      scope: "recipient",
      suppressionKey: event.recipient ? emailSuppressionKey(event.recipient) : null,
    };
  }

  private async markWebhookProcessed(
    webhookEventId: string,
    status: "processed" | "ignored" | "suppressed",
  ) {
    await this.database.db
      .update(webhookEvents)
      .set({
        status,
        processedAt: new Date(),
        errorMessage: null,
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

function readPersistedResendEventType(payload: Record<string, unknown>) {
  const eventType = payload.eventType;
  return eventType === "email.delivered" ||
    eventType === "email.bounced" ||
    eventType === "email.complained" ||
    eventType === "email.suppressed"
    ? eventType
    : null;
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
