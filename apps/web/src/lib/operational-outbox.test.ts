import { describe, expect, it } from "vitest";
import {
  createOperationalOutbox,
  executeOperationalCommand,
  reconcileOperationalOutbox,
  retryOperationalOutboxEntry,
} from "./operational-outbox";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const scope = { tenantId: "tenant-1", branchId: "branch-1" };

describe("operational outbox", () => {
  it("keeps an idempotency key and confirmation across instances", async () => {
    const storage = memoryStorage();
    const first = createOperationalOutbox(scope, storage);
    const pending = await first.enqueue({
      idempotencyKey: "item:one",
      operation: "add_order_item",
      method: "POST",
      path: "/api/v1/pos/orders/order-1/items",
      payload: { productId: "product-1", quantity: 1 },
    });
    expect(pending.status).toBe("pending");

    await first.markAttempt("item:one");
    await first.markConfirmed("item:one", {
      operationId: "item-1",
      version: 2,
      confirmedAt: new Date().toISOString(),
    });

    const reloaded = await createOperationalOutbox(scope, storage).list();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ status: "confirmed", attempts: 1 });
  });

  it("isolates scopes and rejects sensitive values nested in arrays", async () => {
    const storage = memoryStorage();
    const outbox = createOperationalOutbox(scope, storage);
    await outbox.enqueue({
      idempotencyKey: "item:one",
      operation: "add_order_item",
      method: "POST",
      path: "/api/v1/pos/orders/order-1/items",
      payload: { productId: "product-1" },
    });
    expect(
      await createOperationalOutbox({ tenantId: "tenant-2", branchId: "branch-1" }, storage).list(),
    ).toEqual([]);
    await expect(
      outbox.enqueue({
        idempotencyKey: "item:two",
        operation: "add_order_item",
        method: "POST",
        path: "/api/v1/pos/orders/order-1/items",
        payload: { modifiers: [{ token: "never-persist" }] },
      }),
    ).rejects.toThrow("cannot be persisted");
  });

  it("keeps confirmed receipts without blocking pending operations", async () => {
    const outbox = createOperationalOutbox(scope, memoryStorage(), { maxActiveEntries: 3 });
    for (let index = 0; index < 3; index += 1) {
      await outbox.enqueue({
        idempotencyKey: `item:${index}`,
        operation: "add_order_item",
        method: "POST",
        path: "/api/v1/pos/orders/order-1/items",
        payload: { productId: `product-${index}` },
      });
    }
    await outbox.markConfirmed("item:0", {
      operationId: "item-0",
      confirmedAt: new Date().toISOString(),
    });
    await expect(
      outbox.enqueue({
        idempotencyKey: "item:extra",
        operation: "add_order_item",
        method: "POST",
        path: "/api/v1/pos/orders/order-1/items",
        payload: { productId: "product-extra" },
      }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("confirms successful commands and keeps unknown outcomes for reconciliation", async () => {
    const outbox = createOperationalOutbox(scope, memoryStorage());
    const input = {
      idempotencyKey: "payment:one",
      operation: "register_payment",
      method: "POST" as const,
      path: "/api/v1/pos/orders/order-1/payments",
      payload: { amountCents: 1_000, idempotencyKey: "payment:one" },
      replayable: true,
    };
    await expect(
      executeOperationalCommand(outbox, input, async () => {
        throw new TypeError("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");
    await expect(outbox.list()).resolves.toEqual([
      expect.objectContaining({ status: "requires_attention", attempts: 1 }),
    ]);

    const result = await reconcileOperationalOutbox(outbox, async () => ({ paymentId: "p-1" }));
    expect(result).toEqual({ confirmed: 1, failed: 0, requiresAttention: 0 });
    await expect(outbox.list()).resolves.toEqual([
      expect.objectContaining({ status: "confirmed", attempts: 2 }),
    ]);
  });

  it("marks deterministic 4xx rejections as failed instead of retryable", async () => {
    const outbox = createOperationalOutbox(scope, memoryStorage());
    await expect(
      executeOperationalCommand(
        outbox,
        {
          idempotencyKey: "close:one",
          operation: "close_order",
          method: "POST",
          path: "/api/v1/pos/orders/order-1/close",
          payload: {},
        },
        async () => {
          throw Object.assign(new Error("invalid state"), { status: 422 });
        },
      ),
    ).rejects.toThrow("invalid state");
    await expect(outbox.list()).resolves.toEqual([
      expect.objectContaining({ status: "failed", attempts: 1 }),
    ]);
  });

  it("retries only replayable entries and supports explicit manual resolution or discard", async () => {
    const outbox = createOperationalOutbox(scope, memoryStorage());
    await outbox.enqueue({
      idempotencyKey: "open:replayable",
      operation: "open_order",
      method: "POST",
      path: "/api/v1/pos/orders/open",
      payload: { branchId: "branch-1", idempotencyKey: "open:replayable" },
      replayable: true,
    });
    await outbox.enqueue({
      idempotencyKey: "discount:manual",
      operation: "request_discount",
      method: "POST",
      path: "/api/v1/pos/orders/order-1/discount",
      payload: { amountCents: 100 },
      replayable: false,
    });

    await expect(
      retryOperationalOutboxEntry(outbox, "discount:manual", async () => ({ id: "never" })),
    ).rejects.toThrow(/conferência manual/i);
    await expect(
      retryOperationalOutboxEntry(outbox, "open:replayable", async () => ({ id: "order-1" })),
    ).resolves.toMatchObject({ status: "confirmed" });
    await expect(outbox.resolveManually("discount:manual")).resolves.toMatchObject({
      status: "confirmed",
      receipt: { operationId: "manual:discount:manual" },
    });

    await outbox.enqueue({
      idempotencyKey: "help:discard",
      operation: "request_waiter_help",
      method: "POST",
      path: "/api/v1/pos/waiter-assignments/help",
      payload: { tableId: "table-1" },
      replayable: false,
    });
    await expect(outbox.discard("help:discard")).resolves.toBeUndefined();
    expect(
      (await outbox.list()).some(
        (entry: { idempotencyKey: string }) => entry.idempotencyKey === "help:discard",
      ),
    ).toBe(false);
  });

  it("never retries an entry when the replayable flag is absent", async () => {
    const outbox = createOperationalOutbox(scope, memoryStorage());
    await outbox.enqueue({
      idempotencyKey: "legacy:without-opt-in",
      operation: "legacy_operation",
      method: "POST",
      path: "/api/v1/pos/legacy",
      payload: {},
    });
    let sends = 0;
    await expect(
      reconcileOperationalOutbox(outbox, async () => {
        sends += 1;
        return { id: "unexpected" };
      }),
    ).resolves.toEqual({ confirmed: 0, failed: 0, requiresAttention: 0 });
    await expect(
      retryOperationalOutboxEntry(outbox, "legacy:without-opt-in", async () => {
        sends += 1;
        return { id: "unexpected" };
      }),
    ).rejects.toThrow(/conferência manual/i);
    expect(sends).toBe(0);
    await expect(outbox.resolveManually("legacy:without-opt-in")).resolves.toMatchObject({
      status: "confirmed",
    });
  });
});
