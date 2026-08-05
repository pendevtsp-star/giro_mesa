import { createHmac } from "node:crypto";
import {
  loadEnv,
  type SafeHttpRequestInit,
  type SafeHttpResponse,
  safeFetch,
} from "@giromesa/config";
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
  "club.sale.registered",
  "club.stock_movement.created",
] as const;
const CLUB_WHISKY_CONTRACT_VERSION = "2026-07-30";
const CLUB_WHISKY_MAX_ATTEMPTS = 8;
const CLUB_WHISKY_REQUEST_TIMEOUT_MS = 10_000;

type Db = NodePgDatabase<typeof schema>;
type OutboxHttpRequest = (
  value: string | URL,
  init?: SafeHttpRequestInit,
) => Promise<SafeHttpResponse>;
type OutboxPublisherDependencies = { request?: OutboxHttpRequest };

class ClubWhiskyPublishError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ClubWhiskyPublishError";
  }
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clubWhiskyTargetUrl(
  accountConfig: Record<string, unknown>,
  baseUrl: string | undefined,
  nodeEnv: "development" | "test" | "production",
) {
  const webhookUrl = stringOrUndefined(accountConfig.webhookUrl);
  const candidate =
    webhookUrl ?? (baseUrl ? new URL("/v1/webhooks/giromesa", baseUrl).toString() : undefined);
  if (!candidate) {
    return undefined;
  }

  const target = new URL(candidate);
  const configuredOrigin = baseUrl ? new URL(baseUrl).origin : undefined;
  const isLocalDevelopmentTarget =
    nodeEnv !== "production" && ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  const isConfiguredOrigin =
    configuredOrigin === target.origin &&
    (nodeEnv !== "production" || target.protocol === "https:");
  const isCanonicalProductionTarget =
    target.protocol === "https:" && target.hostname === "doseclube.giromesa.com.br";

  return isLocalDevelopmentTarget || isConfiguredOrigin || isCanonicalProductionTarget
    ? target.toString()
    : undefined;
}

export async function publishPendingClubWhiskyOutbox(
  db: Db,
  dependencies: OutboxPublisherDependencies = {},
) {
  const env = loadEnv();
  const request = dependencies.request ?? safeFetch;
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
      ? clubWhiskyTargetUrl(account.config, env.CLUB_WHISKY_API_BASE_URL, env.NODE_ENV)
      : undefined;
    const remoteClientId = account ? stringOrUndefined(account.config.remoteClientId) : undefined;
    const webhookSecretRef = account
      ? (stringOrUndefined(account.config.webhookSecretRef) ?? "CLUB_WHISKY_WEBHOOK_SECRET")
      : undefined;
    const webhookSecret = webhookSecretRef
      ? (process.env[webhookSecretRef] ?? env.CLUB_WHISKY_WEBHOOK_SECRET)
      : undefined;
    if (!account || !targetUrl || !remoteClientId || !webhookSecret) {
      const attempt = claimed.attempts;
      await db
        .update(outboxEvents)
        .set({
          status: attempt >= CLUB_WHISKY_MAX_ATTEMPTS ? "dead_letter" : "pending",
          processedAt: attempt >= CLUB_WHISKY_MAX_ATTEMPTS ? new Date() : null,
          errorMessage: "club_whisky_outbox_webhook_not_configured",
          availableAt: calculateClubWhiskyRetryAt(attempt),
        })
        .where(eq(outboxEvents.id, event.id));
      continue;
    }

    try {
      const correlationId = stringOrUndefined(event.payload.correlationId) ?? event.id;
      const body = JSON.stringify({
        id: event.id,
        event: event.topic,
        source: "giromesa",
        contractVersion: CLUB_WHISKY_CONTRACT_VERSION,
        correlationId,
        occurredAt: event.createdAt,
        data: event.payload,
      });
      const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLUB_WHISKY_REQUEST_TIMEOUT_MS);
      let response: SafeHttpResponse;
      try {
        response = await request(targetUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-giromesa-client-id": remoteClientId,
            "x-giromesa-contract-version": CLUB_WHISKY_CONTRACT_VERSION,
            "x-giromesa-correlation-id": correlationId,
            "x-giromesa-event-id": event.id,
            "x-giromesa-signature": `sha256=${signature}`,
          },
          body,
          signal: controller.signal,
        });
      } catch (error) {
        throw new ClubWhiskyPublishError(
          error instanceof Error && error.name === "AbortError"
            ? "club_whisky_publish_timeout"
            : "club_whisky_publish_unavailable",
          true,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new ClubWhiskyPublishError(
          `club_whisky_publish_failed_${response.status}`,
          response.status === 408 ||
            response.status === 425 ||
            response.status === 429 ||
            response.status >= 500,
        );
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
      const retryable = error instanceof ClubWhiskyPublishError && error.retryable;
      const status =
        retryable && claimed.attempts < CLUB_WHISKY_MAX_ATTEMPTS ? "pending" : "dead_letter";
      await db
        .update(outboxEvents)
        .set({
          status,
          processedAt: status === "dead_letter" ? new Date() : null,
          errorMessage:
            error instanceof ClubWhiskyPublishError ? error.message : "club_whisky_publish_failed",
          availableAt: calculateClubWhiskyRetryAt(claimed.attempts),
        })
        .where(eq(outboxEvents.id, event.id));
    }
  }

  return { scanned: events.length };
}

export function calculateClubWhiskyRetryAt(
  attempt: number,
  nowMs = Date.now(),
  random = Math.random,
) {
  const baseMs = 1_000;
  const cappedExponentialMs = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
  const jitteredMs = Math.min(
    Math.round(cappedExponentialMs * (0.75 + random() * 0.5)),
    15 * 60_000,
  );
  return new Date(nowMs + jitteredMs);
}
