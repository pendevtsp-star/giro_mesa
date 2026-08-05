import { operationalEvents } from "@giromesa/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import {
  defer,
  exhaustMap,
  filter,
  finalize,
  from,
  interval,
  type Observable,
  Subject,
  share,
  startWith,
} from "rxjs";
import { createCounter, createGauge, createHistogram } from "../../common/metrics";
import { DatabaseService } from "../database/database.service";

const activeConsumers = createGauge(
  "giromesa_realtime_active_consumers",
  "Active SSE consumers sharing operational event polling",
);
const sharedBranches = createGauge(
  "giromesa_realtime_shared_branches",
  "Tenant and branch streams allocated in this API instance",
);
const pollCount = createCounter(
  "giromesa_realtime_polls_total",
  "Database polls performed by shared realtime streams",
);
const deliveredEvents = createCounter(
  "giromesa_realtime_events_total",
  "Operational events emitted through shared realtime streams",
);
const batchSize = createHistogram(
  "giromesa_realtime_batch_size",
  "Operational event deltas grouped in each realtime burst",
  [1, 2, 5, 10, 25, 50, 100, 200],
);

type OperationalEventRow = typeof operationalEvents.$inferSelect;

export type OperationalDelta = {
  version: number;
  type: string;
  aggregate: { kind: "branch" | "table" | "order" | "station"; id: string };
  refs: {
    branchId: string;
    tableId?: string | undefined;
    orderId?: string | undefined;
    stationId?: string | undefined;
    sessionId?: string | undefined;
  };
  occurredAt: string;
  data: Record<string, string | number | boolean | null>;
};

export type OperationalDeltaBatch = {
  branchId: string;
  fromVersion: number;
  toVersion: number;
  deltas: OperationalDelta[];
};

type SharedEntry = {
  cursor: number | null;
  stream: Observable<OperationalDeltaBatch>;
};

@Injectable()
export class OperationalRealtimeService {
  private readonly entries = new Map<string, SharedEntry>();
  private readonly pollIntervalMs = positiveInt(
    process.env.REALTIME_POLL_INTERVAL_MS,
    1_000,
    250,
    30_000,
  );
  private readonly batchLimit = positiveInt(process.env.REALTIME_BATCH_LIMIT, 200, 1, 200);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  stream(tenantId: string, branchId: string): Observable<OperationalDeltaBatch> {
    const key = `${tenantId}:${branchId}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.createEntry(tenantId, branchId);
      this.entries.set(key, entry);
      sharedBranches.set({}, this.entries.size);
    }
    return defer(() => {
      activeConsumers.inc();
      return entry.stream.pipe(finalize(() => activeConsumers.inc({}, -1)));
    });
  }

  private createEntry(tenantId: string, branchId: string): SharedEntry {
    const entry = {} as SharedEntry;
    entry.cursor = null;
    entry.stream = interval(this.pollIntervalMs).pipe(
      startWith(0),
      exhaustMap(() => from(this.poll(entry, tenantId, branchId))),
      filter((batch): batch is OperationalDeltaBatch => batch !== null),
      share({
        connector: () => new Subject<OperationalDeltaBatch>(),
        resetOnError: true,
        resetOnComplete: true,
        resetOnRefCountZero: true,
      }),
    );
    return entry;
  }

  private async poll(entry: SharedEntry, tenantId: string, branchId: string) {
    pollCount.inc();
    if (entry.cursor === null) {
      const [latest] = await this.database.db
        .select({ version: operationalEvents.version })
        .from(operationalEvents)
        .where(
          and(eq(operationalEvents.tenantId, tenantId), eq(operationalEvents.branchId, branchId)),
        )
        .orderBy(desc(operationalEvents.version))
        .limit(1);
      entry.cursor = latest?.version ?? 0;
      return null;
    }
    const rows = await this.database.db
      .select()
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.tenantId, tenantId),
          eq(operationalEvents.branchId, branchId),
          gt(operationalEvents.version, entry.cursor),
        ),
      )
      .orderBy(asc(operationalEvents.version))
      .limit(this.batchLimit);
    const fresh = rows.filter((row) => row.version > (entry.cursor ?? 0));
    if (!fresh.length) return null;
    entry.cursor = fresh.at(-1)?.version ?? entry.cursor;
    const deltas = fresh.map(toOperationalDelta);
    deliveredEvents.inc({}, deltas.length);
    batchSize.observe({}, deltas.length);
    return {
      branchId,
      fromVersion: deltas[0]?.version ?? entry.cursor,
      toVersion: entry.cursor,
      deltas,
    };
  }
}

export function toOperationalDelta(row: OperationalEventRow): OperationalDelta {
  const payload = row.payload ?? {};
  const tableId = uuidValue(payload.tableId);
  const orderId = uuidValue(payload.orderId);
  const stationId = uuidValue(payload.stationId);
  const sessionId = uuidValue(payload.sessionId) ?? uuidValue(payload.tableServiceSessionId);
  const aggregateKind = aggregateKindFor(row.aggregateType);
  const aggregateId =
    (aggregateKind === "table" ? tableId : undefined) ??
    (aggregateKind === "order" ? orderId : undefined) ??
    (aggregateKind === "station" ? stationId : undefined) ??
    row.aggregateId ??
    row.branchId;
  return {
    version: row.version,
    type: row.type,
    aggregate: { kind: aggregateKind, id: aggregateId },
    refs: { branchId: row.branchId, tableId, orderId, stationId, sessionId },
    occurredAt: row.occurredAt.toISOString(),
    data: safeDeltaData(payload),
  };
}

export function publicDeltaBatch(
  batch: OperationalDeltaBatch,
  scope: { tableId: string; orderId?: string | null; sessionId: string },
) {
  const deltas = batch.deltas
    .filter(
      (delta) =>
        delta.refs.tableId === scope.tableId ||
        (scope.orderId && delta.refs.orderId === scope.orderId) ||
        delta.refs.sessionId === scope.sessionId,
    )
    .map((delta) => ({
      ...delta,
      data: Object.fromEntries(
        Object.entries(delta.data).filter(([key]) =>
          ["status", "type", "version", "sessionVersion", "requiresReview", "attention"].includes(
            key,
          ),
        ),
      ),
    }));
  if (!deltas.length) return null;
  return { ...batch, fromVersion: deltas[0]?.version ?? batch.fromVersion, deltas };
}

function aggregateKindFor(value: string): OperationalDelta["aggregate"]["kind"] {
  if (/order|payment/.test(value)) return "order";
  if (/station|kds|print/.test(value)) return "station";
  if (/table|service_request|approval_request|waiter_assignment/.test(value)) return "table";
  return "branch";
}

function uuidValue(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
    ? value
    : undefined;
}

function safeDeltaData(payload: Record<string, unknown>) {
  const allowed = [
    "status",
    "type",
    "version",
    "assignmentVersion",
    "orderVersion",
    "sessionVersion",
    "waiterUserId",
    "source",
    "requiresReview",
    "attention",
  ];
  return Object.fromEntries(
    allowed.flatMap((key) => {
      const value = payload[key];
      return value === null || ["string", "number", "boolean"].includes(typeof value)
        ? [[key, value as string | number | boolean | null]]
        : [];
    }),
  );
}

function positiveInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
