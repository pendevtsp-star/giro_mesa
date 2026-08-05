import {
  fiscalDocuments,
  fiscalOperations,
  fiscalProviderCredentials,
  webhookEvents,
} from "@giromesa/db";
import type { RawBodyRequest } from "@nestjs/common";
import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { verifyWebhookSignature } from "../../common/webhook-signature";
import { DatabaseService } from "../database/database.service";

const eventSchema = z.object({
  id: z.string().min(1).max(180),
  type: z.enum([
    "document.authorized",
    "document.rejected",
    "document.canceled",
    "document.unknown",
  ]),
  documentId: z.string().uuid(),
  providerReference: z.string().max(160).optional(),
  accessKey: z.string().max(80).optional(),
  xmlUrl: z.string().url().optional(),
  danfeUrl: z.string().url().optional(),
  errorCode: z.string().max(120).optional(),
});

@Controller("integrations/focus-nfe")
export class FiscalWebhookController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post("webhooks/:credentialId")
  async receiveSimulatorWebhook(
    @Param("credentialId") credentialId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException(
        "Focus webhook is unavailable until the real contract is configured",
      );
    }
    const secret = process.env.FISCAL_SIMULATOR_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException("Fiscal simulator webhook is not configured");
    const event = eventSchema.parse(body);
    if (
      !verifyWebhookSignature({
        secret,
        signature: firstHeader(headers["x-giromesa-signature"]),
        timestamp: firstHeader(headers["x-giromesa-timestamp"]),
        eventId: event.id,
        rawBody: request.rawBody,
      })
    ) {
      throw new UnauthorizedException("Invalid fiscal simulator webhook signature");
    }
    const [credential] = await this.database.db
      .select({
        id: fiscalProviderCredentials.id,
        tenantId: fiscalProviderCredentials.tenantId,
        branchId: fiscalProviderCredentials.branchId,
        environment: fiscalProviderCredentials.environment,
        status: fiscalProviderCredentials.status,
      })
      .from(fiscalProviderCredentials)
      .where(eq(fiscalProviderCredentials.id, z.string().uuid().parse(credentialId)))
      .limit(1);
    if (credential?.status !== "active" || credential.environment !== "homologation") {
      throw new UnauthorizedException("Fiscal credential is unavailable");
    }
    return this.database.db.transaction(async (tx) => {
      const [stored] = await tx
        .insert(webhookEvents)
        .values({
          provider: `focus_nfe_simulator:${credential.id}`,
          tenantId: credential.tenantId,
          branchId: credential.branchId,
          credentialId: credential.id,
          externalEventId: event.id,
          status: "received",
          payload: event,
        })
        .onConflictDoNothing()
        .returning();
      if (!stored) return { accepted: true, duplicate: true };
      const [document] = await tx
        .select()
        .from(fiscalDocuments)
        .where(
          and(
            eq(fiscalDocuments.tenantId, credential.tenantId),
            eq(fiscalDocuments.branchId, credential.branchId),
            eq(fiscalDocuments.id, event.documentId),
            eq(fiscalDocuments.environment, "homologation"),
          ),
        )
        .limit(1);
      if (!document) {
        await tx
          .update(webhookEvents)
          .set({ status: "ignored", processedAt: new Date(), errorMessage: "document_not_found" })
          .where(eq(webhookEvents.id, stored.id));
        return { accepted: true, duplicate: false, ignored: true };
      }
      const now = new Date();
      const patch =
        event.type === "document.authorized"
          ? {
              status: "authorized" as const,
              externalId: event.providerReference ?? document.externalId,
              accessKey: event.accessKey ?? document.accessKey,
              xmlUrl: event.xmlUrl ?? document.xmlUrl,
              danfeUrl: event.danfeUrl ?? document.danfeUrl,
              issuedAt: document.issuedAt ?? now,
              errorMessage: null,
            }
          : event.type === "document.canceled"
            ? { status: "canceled" as const, canceledAt: now, errorMessage: null }
            : event.type === "document.rejected"
              ? {
                  status: "rejected" as const,
                  errorMessage: event.errorCode ?? "simulator_rejected",
                }
              : { status: "pending" as const, errorMessage: "result_unknown_query_required" };
      const transitionBlocked =
        document.status === "canceled" ||
        (document.status === "authorized" && event.type !== "document.canceled");
      if (!transitionBlocked) {
        await tx
          .update(fiscalDocuments)
          .set({ ...patch, updatedAt: now })
          .where(eq(fiscalDocuments.id, document.id));
      }
      await tx
        .update(fiscalOperations)
        .set({
          status: event.type === "document.unknown" ? "retryable" : "succeeded",
          errorCode: event.errorCode ?? null,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(fiscalOperations.tenantId, credential.tenantId),
            eq(fiscalOperations.fiscalDocumentId, document.id),
            eq(fiscalOperations.status, "processing"),
          ),
        );
      await tx
        .update(webhookEvents)
        .set({
          status: transitionBlocked ? "ignored" : "processed",
          processedAt: now,
          errorMessage: transitionBlocked ? "non_monotonic_transition" : null,
        })
        .where(eq(webhookEvents.id, stored.id));
      return { accepted: true, duplicate: false, ignored: transitionBlocked };
    });
  }
}
