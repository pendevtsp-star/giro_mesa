import { auditLogs, outboxEvents } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

const clubWhiskyTopics = [
  "product.updated",
  "stock.updated",
  "order.closed",
  "payment.confirmed",
  "customer.updated",
  "club.sale.registered",
  "club.stock_movement.created",
];

export type ListOutboxInput = {
  status?: string | undefined;
  limit?: number | undefined;
};

@Injectable()
export class OutboxService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listEvents(context: TenantContext, input: ListOutboxInput = {}) {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
    const filters = [eq(outboxEvents.tenantId, context.tenantId)];

    if (input.status) {
      filters.push(eq(outboxEvents.status, input.status));
    }

    return this.database.db
      .select({
        id: outboxEvents.id,
        topic: outboxEvents.topic,
        payload: outboxEvents.payload,
        status: outboxEvents.status,
        attempts: outboxEvents.attempts,
        availableAt: outboxEvents.availableAt,
        processedAt: outboxEvents.processedAt,
        errorMessage: outboxEvents.errorMessage,
        createdAt: outboxEvents.createdAt,
        updatedAt: outboxEvents.updatedAt,
      })
      .from(outboxEvents)
      .where(and(...filters))
      .orderBy(desc(outboxEvents.createdAt))
      .limit(limit);
  }

  async retryEvent(context: TenantContext, eventId: string) {
    return this.database.db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.id, eventId),
            eq(outboxEvents.tenantId, context.tenantId),
            inArray(outboxEvents.topic, clubWhiskyTopics),
          ),
        )
        .limit(1);

      if (!event) {
        throw new NotFoundException("Dose Club outbox event not found");
      }

      if (!["dead_letter", "failed"].includes(event.status)) {
        throw new ConflictException("Only failed or dead-letter events can be retried");
      }

      const [updated] = await tx
        .update(outboxEvents)
        .set({
          status: "pending",
          attempts: 0,
          availableAt: new Date(),
          processedAt: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(outboxEvents.id, event.id),
            eq(outboxEvents.tenantId, context.tenantId),
            eq(outboxEvents.status, event.status),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictException("Outbox event changed before it could be retried");
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "integration.club_whisky_outbox_retried",
        entityType: "outbox_event",
        entityId: event.id,
        metadata: {
          topic: event.topic,
          previousStatus: event.status,
          previousAttempts: event.attempts,
        },
      });

      return {
        id: updated.id,
        topic: updated.topic,
        status: updated.status,
        attempts: updated.attempts,
        availableAt: updated.availableAt,
      };
    });
  }
}
