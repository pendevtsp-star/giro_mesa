import { loadEnv } from "@giromesa/config";
import type * as schema from "@giromesa/db";
import { integrationAccounts, outboxEvents } from "@giromesa/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const clubWhiskyTopics = [
  "product.updated",
  "stock.updated",
  "order.closed",
  "payment.confirmed",
  "customer.updated",
  "club.stock_movement.created",
] as const;

type Db = NodePgDatabase<typeof schema>;

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clubWhiskyTargetUrl(accountConfig: Record<string, unknown>, baseUrl?: string) {
  const webhookUrl = stringOrUndefined(accountConfig.webhookUrl);
  if (webhookUrl) {
    return webhookUrl;
  }

  if (!baseUrl) {
    return undefined;
  }

  return new URL("/webhooks/giromesa", baseUrl).toString();
}

export async function publishPendingClubWhiskyOutbox(db: Db) {
  const env = loadEnv();
  const events = await db
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.status, "pending"),
        lte(outboxEvents.availableAt, new Date()),
        inArray(outboxEvents.topic, [...clubWhiskyTopics]),
      ),
    )
    .limit(25);

  for (const event of events) {
    const [claimed] = await db
      .update(outboxEvents)
      .set({
        status: "processing",
        attempts: sql`${outboxEvents.attempts} + 1`,
      })
      .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, "pending")))
      .returning();

    if (!claimed || !event.tenantId) {
      continue;
    }

    const [account] = await db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, event.tenantId),
          eq(integrationAccounts.provider, "club_whisky"),
          eq(integrationAccounts.status, "active"),
        ),
      )
      .limit(1);

    const targetUrl = account
      ? clubWhiskyTargetUrl(account.config, env.CLUB_WHISKY_API_BASE_URL)
      : undefined;
    if (!account || !targetUrl || !env.CLUB_WHISKY_API_KEY) {
      await db
        .update(outboxEvents)
        .set({
          status: "pending",
          errorMessage: "club_whisky_outbox_not_configured",
          availableAt: new Date(Date.now() + 60_000),
        })
        .where(eq(outboxEvents.id, event.id));
      continue;
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CLUB_WHISKY_API_KEY}`,
          "content-type": "application/json",
          "x-giromesa-event-id": event.id,
          "x-giromesa-topic": event.topic,
        },
        body: JSON.stringify({
          id: event.id,
          tenantId: event.tenantId,
          topic: event.topic,
          payload: event.payload,
          createdAt: event.createdAt,
        }),
      });

      if (!response.ok) {
        throw new Error(`club_whisky_publish_failed_${response.status}`);
      }

      await db
        .update(outboxEvents)
        .set({
          status: "processed",
          processedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(outboxEvents.id, event.id));
    } catch (error) {
      await db
        .update(outboxEvents)
        .set({
          status: "pending",
          errorMessage: error instanceof Error ? error.message : "club_whisky_publish_failed",
          availableAt: new Date(Date.now() + Math.min(300_000, 15_000 * (event.attempts + 1))),
        })
        .where(eq(outboxEvents.id, event.id));
    }
  }

  return { scanned: events.length };
}
