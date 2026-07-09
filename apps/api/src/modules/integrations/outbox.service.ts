import { outboxEvents } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

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
}
