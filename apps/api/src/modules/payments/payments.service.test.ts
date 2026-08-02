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
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows.shift() ?? []),
      })),
    })),
  }));
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

  return { db: { select, insert, update }, select, insert, update };
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
        id: "payment-a",
        provider: "asaas",
        status: "confirmed",
        orderId: "order-a",
        amountCents: 1000,
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
    const database = databaseWithSelectRows(
      [
        {
          id: "payment-a",
          provider: "manual",
          status: "confirmed",
          orderId: "order-a",
          amountCents: 1000,
        },
      ],
      [],
      [
        {
          id: "payment-a",
          provider: "manual",
          status: "confirmed",
          orderId: "order-a",
          amountCents: 1000,
        },
      ],
      [{ id: "refund-a", amountCents: -1000 }],
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
});
