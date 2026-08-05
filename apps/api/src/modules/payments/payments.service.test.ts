import { createHash } from "node:crypto";
import { orders, webhookEvents } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { describe, expect, it, vi } from "vitest";
import { PaymentsService } from "./payments.service";

const context: TenantContext = {
  tenantId: "tenant-a",
  branchId: "branch-a",
  userId: "user-a",
  requestId: "request-a",
  permissions: ["payment:create", "payment:refund"],
};

function databaseWithSelectRows(...rows: unknown[][]) {
  const select = vi.fn(() => {
    const query = {
      leftJoin: vi.fn(() => query),
      where: vi.fn(() => {
        const resultRows = rows.shift() ?? [];
        return Object.assign(Promise.resolve(resultRows), {
          limit: vi.fn(async () => resultRows),
        });
      }),
    };
    return { from: vi.fn(() => query) };
  });
  const returning = vi.fn(async () => [{ id: "webhook-event-a" }]);
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({ returning })),
      returning,
    })),
  }));
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => []),
    })),
  }));

  const db = {
    select,
    insert,
    update,
    execute: vi.fn(async () => []),
    transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(db)),
  };
  return { db, select, insert, update };
}

describe("PaymentsService operational boundary", () => {
  it("rejects boleto because Asaas is platform billing only", async () => {
    const database = databaseWithSelectRows(
      [{ id: "order-a", tenantId: "tenant-a", branchId: "branch-a", totalCents: 1000 }],
      [],
    );
    const service = new PaymentsService(database as never);

    await expect(
      service.createPayment(context, {
        orderId: "order-a",
        method: "boleto",
        amountCents: 1000,
        idempotencyKey: "boleto-key-1",
      }),
    ).rejects.toThrow(
      "Asaas is reserved for platform subscriptions; operational payments must use a manual or external POS method",
    );
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("never refunds a historical Asaas operational payment", async () => {
    const database = databaseWithSelectRows([
      {
        payment: {
          id: "payment-a",
          tenantId: "tenant-a",
          branchId: "branch-a",
          provider: "asaas",
          status: "confirmed",
          paymentType: "charge",
          orderId: "order-a",
          amountCents: 1000,
        },
        orderBranchId: "branch-a",
      },
    ]);
    const service = new PaymentsService(database as never);

    await expect(service.refundPayment(context, "payment-a")).rejects.toThrow(
      "Asaas is reserved for platform subscriptions; operational payments cannot be refunded through Asaas",
    );
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.update).not.toHaveBeenCalled();
  });

  it("records an Asaas webhook as ignored without touching an order", async () => {
    const database = databaseWithSelectRows();
    const service = new PaymentsService(database as never);

    const result = await service.handleWebhook({
      provider: "asaas",
      externalEventId: "event-a",
      payload: {
        event: "PAYMENT_RECEIVED",
        payment: { id: "pay_a" },
      },
    });

    expect(result).toMatchObject({
      accepted: true,
      ignored: true,
      reason: "Asaas webhooks are reserved for platform billing",
    });
    expect(database.update).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledWith(webhookEvents);
    expect(database.update).not.toHaveBeenCalledWith(orders);
  });

  it("returns the same manual refund when the idempotency key is replayed", async () => {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          tenantId: "tenant-a",
          branchId: "branch-a",
          originalPaymentId: "payment-a",
          amountCents: 1000,
          reason: "customer request",
        }),
      )
      .digest("hex");
    const original = {
      payment: {
        id: "payment-a",
        tenantId: "tenant-a",
        branchId: "branch-a",
        provider: "manual",
        method: "cash",
        status: "confirmed",
        paymentType: "charge",
        orderId: "order-a",
        amountCents: 1000,
        registeredByUserId: "user-a",
        registeredVia: "cashier",
        cashHandoverStatus: "not_required",
      },
      orderBranchId: "branch-a",
    };
    const database = databaseWithSelectRows(
      [original],
      [],
      [],
      [original],
      [
        {
          id: "refund-a",
          tenantId: "tenant-a",
          branchId: "branch-a",
          amountCents: 1000,
          paymentType: "refund",
          originalPaymentId: "payment-a",
          metadata: { refundRequestHash: requestHash },
        },
      ],
    );
    const service = new PaymentsService(database as never);

    const first = await service.refundPayment(
      context,
      "payment-a",
      1000,
      "customer request",
      "refund-key-1",
    );
    const replay = await service.refundPayment(
      context,
      "payment-a",
      1000,
      "customer request",
      "refund-key-1",
    );

    expect(first).toMatchObject({ accepted: true, duplicate: false, amountCents: 1000 });
    expect(replay).toMatchObject({ accepted: true, duplicate: true, refundId: "refund-a" });
    expect(database.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects a refund from another branch", async () => {
    const database = databaseWithSelectRows([
      {
        payment: {
          id: "payment-b",
          tenantId: "tenant-a",
          branchId: "branch-b",
          provider: "manual",
          status: "confirmed",
          paymentType: "charge",
          orderId: "order-b",
          amountCents: 1000,
        },
        orderBranchId: "branch-b",
      },
    ]);
    const service = new PaymentsService(database as never);
    await expect(service.refundPayment(context, "payment-b", 1000)).rejects.toThrow(
      "Payment does not belong to this branch",
    );
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("rejects the same idempotency key with a conflicting refund payload", async () => {
    const original = {
      payment: {
        id: "payment-a",
        tenantId: "tenant-a",
        branchId: "branch-a",
        provider: "manual",
        method: "cash",
        status: "confirmed",
        paymentType: "charge",
        orderId: "order-a",
        amountCents: 1000,
      },
      orderBranchId: "branch-a",
    };
    const database = databaseWithSelectRows(
      [original],
      [
        {
          id: "refund-a",
          branchId: "branch-a",
          paymentType: "refund",
          originalPaymentId: "payment-a",
          amountCents: 500,
          metadata: { refundRequestHash: "different" },
        },
      ],
    );
    const service = new PaymentsService(database as never);
    await expect(
      service.refundPayment(context, "payment-a", 500, "reason", "same-key"),
    ).rejects.toThrow("Idempotency key was reused with a different refund payload");
  });
});
