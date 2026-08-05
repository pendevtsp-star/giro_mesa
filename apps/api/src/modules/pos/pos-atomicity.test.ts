import type { PaymentMethod, TenantContext } from "@giromesa/domain";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import type { FiscalService } from "../fiscal/fiscal.service";
import type { OrderRepository } from "./order.repository";
import { OrdersService, planOrderInventoryMovements } from "./orders.service";
import { PaymentsService } from "./payments.service";
import type { PosRepository } from "./pos.repository";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  branchId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  requestId: "atomicity-test",
  permissions: ["pos:operate"],
} satisfies TenantContext;

function transactionDatabase() {
  const tx = { marker: "transaction-client", execute: vi.fn(async () => []) };
  const database = {
    db: {
      transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  } as unknown as DatabaseService;
  return { database, tx };
}

function paymentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: context.tenantId,
    branchId: context.branchId,
    orderId: "55555555-5555-4555-8555-555555555555",
    provider: "manual",
    method: "pix_manual",
    status: "confirmed",
    amountCents: 1_000,
    externalId: null,
    idempotencyKey: "payment-atomicity-key",
    registeredByUserId: context.userId,
    registeredVia: "cashier",
    cashHandoverStatus: "not_required",
    cashHandoverReceivedByUserId: null,
    cashHandoverReceivedAt: null,
    metadata: {},
    confirmedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    tenantId: context.tenantId,
    branchId: context.branchId,
    tableId: null,
    customerId: null,
    channel: "counter",
    status: "opened",
    peopleCount: 1,
    subtotalCents: 1_000,
    discountCents: 0,
    serviceChargeCents: 0,
    deliveryFeeCents: 0,
    totalCents: 1_000,
    version: 3,
    openedAt: new Date(),
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function paymentInput(
  overrides: Partial<{
    amountCents: number;
    method: PaymentMethod;
    idempotencyKey: string;
    registeredVia: "waiter" | "cashier";
    reference: string;
  }> = {},
) {
  return {
    amountCents: 1_000,
    method: "pix_manual" as PaymentMethod,
    idempotencyKey: "payment-atomicity-key",
    registeredVia: "cashier" as const,
    ...overrides,
  };
}

describe("POS payment atomicity", () => {
  it("returns an operational payment from the current branch", async () => {
    const payment = paymentFixture();
    const database = {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn(async () => [payment]) })),
          })),
        })),
      },
    } as unknown as DatabaseService;
    const service = new PaymentsService(database, {} as OrderRepository);

    await expect(service.getPayment(context, payment.id)).resolves.toBe(payment);
  });

  it("replays an existing payment when key and payload match", async () => {
    const { database, tx } = transactionDatabase();
    const existing = paymentFixture();
    const repository = {
      findPaymentByIdempotencyKey: vi.fn(async () => existing),
      findOrderById: vi.fn(async () => orderFixture({ status: "paid" })),
      insertPayment: vi.fn(),
      insertAuditLog: vi.fn(),
      insertOutboxEvent: vi.fn(),
    } as unknown as OrderRepository;
    const service = new PaymentsService(database, repository);

    const result = await service.registerPayment(context, existing.orderId, paymentInput());

    expect(result.id).toBe(existing.id);
    expect(result.orderStatus).toBe("paid");
    expect(repository.findPaymentByIdempotencyKey).toHaveBeenCalledWith(
      context,
      existing.idempotencyKey,
      tx,
    );
    expect(repository.insertPayment).not.toHaveBeenCalled();
    expect(repository.insertAuditLog).not.toHaveBeenCalled();
    expect(repository.insertOutboxEvent).not.toHaveBeenCalled();
  });

  it("returns conflict when an idempotency key is reused with a different payload", async () => {
    const { database } = transactionDatabase();
    const existing = paymentFixture();
    const repository = {
      findPaymentByIdempotencyKey: vi.fn(async () => existing),
      findOrderById: vi.fn(async () => orderFixture()),
    } as unknown as OrderRepository;
    const service = new PaymentsService(database, repository);

    await expect(
      service.registerPayment(
        context,
        existing.orderId,
        paymentInput({ amountCents: existing.amountCents + 1 }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects overpayment before order, cash, audit or outbox updates", async () => {
    const { database } = transactionDatabase();
    const inserted = paymentFixture({ amountCents: 600 });
    const repository = {
      findPaymentByIdempotencyKey: vi.fn(async () => null),
      findOrderById: vi.fn(async () => orderFixture()),
      insertPayment: vi.fn(async () => inserted),
      findPaymentsByOrder: vi.fn(async () => [
        paymentFixture({ id: "66666666-6666-4666-8666-666666666666", amountCents: 500 }),
        inserted,
      ]),
      updateOrder: vi.fn(),
      updateCashSession: vi.fn(),
      insertAuditLog: vi.fn(),
      insertOutboxEvent: vi.fn(),
    } as unknown as OrderRepository;
    const service = new PaymentsService(database, repository);

    await expect(
      service.registerPayment(
        context,
        inserted.orderId,
        paymentInput({ amountCents: inserted.amountCents }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateOrder).not.toHaveBeenCalled();
    expect(repository.updateCashSession).not.toHaveBeenCalled();
    expect(repository.insertAuditLog).not.toHaveBeenCalled();
    expect(repository.insertOutboxEvent).not.toHaveBeenCalled();
  });

  it("uses the transaction client and expected order version on a new payment", async () => {
    const { database, tx } = transactionDatabase();
    const order = orderFixture();
    const inserted = paymentFixture();
    const repository = {
      findPaymentByIdempotencyKey: vi.fn(async () => null),
      findOrderById: vi.fn(async () => order),
      insertPayment: vi.fn(async () => inserted),
      findPaymentsByOrder: vi.fn(async () => [inserted]),
      updateOrder: vi.fn(async () => ({ ...order, status: "paid", version: 4 })),
      findCashSession: vi.fn(async () => null),
      insertAuditLog: vi.fn(async () => null),
      insertOutboxEvent: vi.fn(async () => null),
    } as unknown as OrderRepository;
    const service = new PaymentsService(database, repository);

    await service.registerPayment(context, order.id, paymentInput());

    expect(repository.insertPayment).toHaveBeenCalledWith(context, expect.any(Object), tx);
    expect(repository.updateOrder).toHaveBeenCalledWith(
      context,
      order.id,
      expect.objectContaining({ status: "paid", version: order.version + 1 }),
      order.version,
      tx,
    );
    expect(repository.insertAuditLog).toHaveBeenCalledWith(context, expect.any(Object), tx);
    expect(repository.insertOutboxEvent).toHaveBeenCalledWith(context, expect.any(Object), tx);
  });
});

describe("POS order close atomicity", () => {
  it("replays an already closed order without duplicate stock or fiscal work", async () => {
    const { database, tx } = transactionDatabase();
    const repository = {
      findOrderById: vi.fn(async () => orderFixture({ status: "paid", closedAt: new Date() })),
      updateOrder: vi.fn(),
      insertStockMovement: vi.fn(),
      insertAuditLog: vi.fn(),
      insertOutboxEvent: vi.fn(),
    } as unknown as OrderRepository;
    const fiscal = {
      createPendingOrderDocument: vi.fn(),
    } as unknown as FiscalService;
    const service = new OrdersService(database, {} as PosRepository, repository, fiscal);

    const result = await service.closeOrder(context, orderFixture().id);

    expect(result.audit).toBe("order.closed");
    expect(repository.findOrderById).toHaveBeenCalledWith(context, orderFixture().id, tx);
    expect(repository.updateOrder).not.toHaveBeenCalled();
    expect(repository.insertStockMovement).not.toHaveBeenCalled();
    expect(repository.insertAuditLog).not.toHaveBeenCalled();
    expect(repository.insertOutboxEvent).not.toHaveBeenCalled();
    expect(fiscal.createPendingOrderDocument).not.toHaveBeenCalled();
  });

  it("claims the order version before creating stock movements", async () => {
    const { database, tx } = transactionDatabase();
    const order = orderFixture({ status: "paid" });
    const repository = {
      findOrderById: vi.fn(async () => order),
      updateOrder: vi.fn(async () => null),
      findOrderItems: vi.fn(),
      insertStockMovement: vi.fn(),
    } as unknown as OrderRepository;
    const service = new OrdersService(
      database,
      {} as PosRepository,
      repository,
      {} as FiscalService,
    );

    await expect(service.closeOrder(context, order.id)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateOrder).toHaveBeenCalledWith(
      context,
      order.id,
      expect.objectContaining({ closedAt: expect.any(Date), version: order.version + 1 }),
      order.version,
      tx,
    );
    expect(repository.findOrderItems).not.toHaveBeenCalled();
    expect(repository.insertStockMovement).not.toHaveBeenCalled();
  });
});

describe("POS returnable stock planning", () => {
  const baseInput = {
    order: { id: "order-1", branchId: "branch-1" },
    items: [{ id: "order-item-1", productId: "product-1", quantity: "2" }],
    returnables: [
      {
        productId: "product-1",
        fullInventoryItemId: "full-item",
        emptyInventoryItemId: "empty-item",
      },
    ],
    location: { id: "bar-location", name: "Bar" },
  };

  it("moves full and empty returnables even when the product has no recipe", () => {
    const movements = planOrderInventoryMovements({
      ...baseInput,
      recipes: [],
      ingredients: [],
    });

    expect(movements).toEqual([
      expect.objectContaining({
        inventoryItemId: "full-item",
        type: "returnable_consumption",
        quantity: "-2",
      }),
      expect.objectContaining({
        inventoryItemId: "empty-item",
        type: "returnable_consumption",
        quantity: "2",
      }),
    ]);
  });

  it("does not deduct the full returnable twice when it is already in the recipe", () => {
    const movements = planOrderInventoryMovements({
      ...baseInput,
      recipes: [{ id: "recipe-1", productId: "product-1" }],
      ingredients: [{ recipeId: "recipe-1", inventoryItemId: "full-item", quantity: "1" }],
    });

    expect(movements.filter((movement) => movement.inventoryItemId === "full-item")).toEqual([
      expect.objectContaining({ type: "sale", quantity: "-2" }),
    ]);
    expect(movements).toContainEqual(
      expect.objectContaining({
        inventoryItemId: "empty-item",
        type: "returnable_consumption",
        quantity: "2",
      }),
    );
  });
});

describe("waiter order item idempotency", () => {
  it("replays the same locally queued item without changing the order twice", async () => {
    const { database, tx } = transactionDatabase();
    const replay = {
      id: "77777777-7777-4777-8777-777777777777",
      tenantId: context.tenantId,
      orderId: orderFixture().id,
      productId: "88888888-8888-4888-8888-888888888888",
      quantity: "1",
      notes: "Sem gelo",
      modifiers: [{ optionId: "99999999-9999-4999-8999-999999999999" }],
      idempotencyKey: "waiter-local-item-key",
    };
    const repository = {
      findOrderItemByIdempotencyKey: vi.fn(async () => replay),
      findOrderById: vi.fn(),
      insertOrderItem: vi.fn(),
      updateOrder: vi.fn(),
    } as unknown as OrderRepository;
    const service = new OrdersService(
      database,
      {} as PosRepository,
      repository,
      {} as FiscalService,
    );

    const result = await service.addItem(context, replay.orderId, {
      productId: replay.productId,
      quantity: 1,
      notes: replay.notes,
      modifiers: replay.modifiers,
      idempotencyKey: replay.idempotencyKey,
    });

    expect(result).toEqual(expect.objectContaining({ id: replay.id, replayed: true }));
    expect(repository.findOrderItemByIdempotencyKey).toHaveBeenCalledWith(
      context,
      replay.idempotencyKey,
      tx,
    );
    expect(repository.findOrderById).not.toHaveBeenCalled();
    expect(repository.insertOrderItem).not.toHaveBeenCalled();
    expect(repository.updateOrder).not.toHaveBeenCalled();

    await expect(
      service.addItem(context, replay.orderId, {
        productId: replay.productId,
        quantity: 1,
        notes: replay.notes,
        modifiers: [],
        idempotencyKey: replay.idempotencyKey,
      }),
    ).rejects.toThrow(/different order item/i);
  });
});

describe("QR automatic production dispatch", () => {
  it("acknowledges a replay after the batch was already sent without creating another ticket", async () => {
    const { database, tx } = transactionDatabase();
    const order = { ...orderFixture(), channel: "qr", status: "sent_to_kitchen" };
    const repository = {
      findOrderById: vi.fn(async () => order),
      findPendingOrderItemsForRouting: vi.fn(async () => []),
      insertKdsTickets: vi.fn(),
      updateOrderItemsStatus: vi.fn(),
    } as unknown as OrderRepository;
    const service = new OrdersService(
      database,
      {} as PosRepository,
      repository,
      {} as FiscalService,
    );

    await expect(service.autoSendQrOrder(context, order.id)).resolves.toMatchObject({
      orderId: order.id,
      status: "sent_to_kitchen",
      replayed: true,
      ticketsCreated: [],
    });
    expect(repository.findOrderById).toHaveBeenCalledWith(context, order.id, tx);
    expect(repository.insertKdsTickets).not.toHaveBeenCalled();
    expect(repository.updateOrderItemsStatus).not.toHaveBeenCalled();
  });
});
