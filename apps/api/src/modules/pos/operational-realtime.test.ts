import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import {
  OperationalRealtimeService,
  publicDeltaBatch,
  toOperationalDelta,
} from "./operational-realtime.service";

const tenantId = "10000000-0000-4000-8000-000000000001";
const branchId = "20000000-0000-4000-8000-000000000001";
const tableId = "30000000-0000-4000-8000-000000000001";
const orderId = "40000000-0000-4000-8000-000000000001";

describe("operational realtime deltas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fans one shared poll out to 600 consumers without stale duplicate delivery", async () => {
    vi.useFakeTimers();
    let queries = 0;
    const event = row({ version: 11, payload: { tableId, orderId, status: "opened" } });
    const database = {
      db: {
        select: () => {
          queries += 1;
          const result = queries === 1 ? [{ version: 10 }] : queries === 2 ? [event] : [];
          const builder = {
            from: () => builder,
            where: () => builder,
            orderBy: () => builder,
            limit: async () => result,
          };
          return builder;
        },
      },
    } as unknown as DatabaseService;
    const service = new OperationalRealtimeService(database);
    let deliveries = 0;
    const subscriptions = Array.from({ length: 600 }, () =>
      service.stream(tenantId, branchId).subscribe(() => {
        deliveries += 1;
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(queries).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queries).toBe(2);
    expect(deliveries).toBe(600);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(deliveries).toBe(600);

    for (const subscription of subscriptions) subscription.unsubscribe();
  });

  it("maps only safe typed refs and filters a public occupation scope", () => {
    const matching = toOperationalDelta(
      row({
        version: 21,
        payload: { tableId, orderId, status: "sent", secret: "must-not-leak" },
      }),
    );
    const unrelated = toOperationalDelta(
      row({
        version: 22,
        aggregateId: "50000000-0000-4000-8000-000000000001",
        payload: { tableId: "60000000-0000-4000-8000-000000000001", status: "opened" },
      }),
    );
    expect(matching.aggregate.kind).toBe("order");
    expect(matching.data).toEqual({ status: "sent" });
    const filtered = publicDeltaBatch(
      { branchId, fromVersion: 21, toVersion: 22, deltas: [matching, unrelated] },
      { tableId, orderId, sessionId: "70000000-0000-4000-8000-000000000001" },
    );
    expect(filtered?.deltas).toEqual([matching]);
  });
});

function row(input: {
  version: number;
  aggregateId?: string | null;
  payload: Record<string, unknown>;
}) {
  return {
    id: `00000000-0000-4000-8000-${String(input.version).padStart(12, "0")}`,
    version: input.version,
    tenantId,
    branchId,
    type: "order.updated",
    aggregateType: "order",
    aggregateId: input.aggregateId ?? orderId,
    actorUserId: null,
    payload: input.payload,
    occurredAt: new Date("2026-08-05T12:00:00.000Z"),
  };
}
