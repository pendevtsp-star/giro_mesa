import { createHash } from "node:crypto";
import { operationIdempotency } from "@giromesa/db";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";

type Tx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

export type OperationReceipt = {
  operationId: string;
  scope: string;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  serverTime: string;
};

export type ConfirmedOperation<T extends Record<string, unknown>> = T & {
  receipt: OperationReceipt;
};

export async function reserveOperation<T extends Record<string, unknown>>(
  tx: Tx,
  input: {
    tenantId: string;
    branchId: string;
    scope: string;
    idempotencyKey: string;
    payload: unknown;
  },
): Promise<{ reservationId: string; replay: null } | { reservationId: null; replay: T }> {
  const requestHash = hashStable(input.payload);
  const [reserved] = await tx
    .insert(operationIdempotency)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId,
      scope: input.scope,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    })
    .onConflictDoNothing()
    .returning({ id: operationIdempotency.id });
  if (reserved) return { reservationId: reserved.id, replay: null };

  const [existing] = await tx
    .select()
    .from(operationIdempotency)
    .where(
      and(
        eq(operationIdempotency.tenantId, input.tenantId),
        eq(operationIdempotency.branchId, input.branchId),
        eq(operationIdempotency.scope, input.scope),
        eq(operationIdempotency.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing || existing.requestHash !== requestHash) {
    throw new ConflictException("Idempotency key was already used with a different payload");
  }
  if (existing.status !== "completed" || !existing.response) {
    throw new ConflictException("Operation with this idempotency key is still being processed");
  }
  return { reservationId: null, replay: existing.response as T };
}

export async function confirmOperation<T extends Record<string, unknown>>(
  tx: Tx,
  input: {
    reservationId: string;
    scope: string;
    idempotencyKey: string;
    aggregateType: string;
    aggregateId: string;
    version: number;
    result: T;
    serverTime?: Date | undefined;
  },
): Promise<ConfirmedOperation<T>> {
  const receipt: OperationReceipt = {
    operationId: input.reservationId,
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    version: input.version,
    serverTime: (input.serverTime ?? new Date()).toISOString(),
  };
  const response = { ...input.result, receipt };
  const [completed] = await tx
    .update(operationIdempotency)
    .set({ status: "completed", response, completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(operationIdempotency.id, input.reservationId),
        eq(operationIdempotency.status, "processing"),
      ),
    )
    .returning({ id: operationIdempotency.id });
  if (!completed) throw new ConflictException("Operation receipt could not be completed");
  return response;
}

export async function findOperationReceipt(
  db: DatabaseService["db"],
  input: {
    tenantId: string;
    branchId: string;
    scope: string;
    idempotencyKey: string;
  },
) {
  const [record] = await db
    .select({ status: operationIdempotency.status, response: operationIdempotency.response })
    .from(operationIdempotency)
    .where(
      and(
        eq(operationIdempotency.tenantId, input.tenantId),
        eq(operationIdempotency.branchId, input.branchId),
        eq(operationIdempotency.scope, input.scope),
        eq(operationIdempotency.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!record) throw new NotFoundException("Operation receipt not found");
  return record;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStable(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
