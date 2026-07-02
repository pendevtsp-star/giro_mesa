import {
  cashSessions,
  diningTables,
  kdsStations,
  kdsTickets,
  orderItems,
  orders,
  payments,
  products,
  recipeItems,
  recipes,
  stockLocations,
  stockMovements,
} from "@giromesa/db";
import {
  calculateOrderTotal,
  type PaymentMethod,
  splitAmount,
  stateMachines,
  type TenantContext,
} from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type OpenOrderInput = {
  channel: "counter" | "table" | "tab" | "delivery" | "qr";
  branchId: string;
  tableId?: string | undefined;
  peopleCount?: number | undefined;
};

type AddItemInput = {
  productId: string;
  quantity: number;
  notes?: string | undefined;
  modifiers?: Record<string, unknown>[] | undefined;
};

type RegisterPaymentInput = {
  amountCents: number;
  method: PaymentMethod;
  idempotencyKey: string;
};

type OpenCashSessionInput = {
  branchId: string;
  openingAmountCents: number;
};

type CloseCashSessionInput = {
  countedAmountCents: number;
};

@Injectable()
export class PosService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listTables(context: TenantContext, branchId: string) {
    return this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)));
  }

  async openOrder(context: TenantContext, input: OpenOrderInput) {
    return this.database.db.transaction(async (tx) => {
      if (input.tableId) {
        const [table] = await tx
          .select()
          .from(diningTables)
          .where(
            and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, input.tableId)),
          )
          .limit(1);

        if (!table) {
          throw new NotFoundException("Table not found");
        }

        await tx
          .update(diningTables)
          .set({ status: "occupied", updatedAt: new Date() })
          .where(eq(diningTables.id, table.id));
      }

      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          tableId: input.tableId,
          channel: input.channel,
          status: "opened",
          peopleCount: input.peopleCount ?? 1,
          openedAt: new Date(),
        })
        .returning();

      if (!order) {
        throw new Error("Failed to open order");
      }

      return {
        ...order,
        audit: "order.opened",
      };
    });
  }

  async addItem(context: TenantContext, orderId: string, input: AddItemInput) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, context.tenantId), eq(products.id, input.productId)))
        .limit(1);

      if (!product?.isAvailable) {
        throw new NotFoundException("Product not found or unavailable");
      }

      const total = calculateOrderTotal({
        lines: [{ quantity: input.quantity, unitPriceCents: product.priceCents }],
      });

      const [item] = await tx
        .insert(orderItems)
        .values({
          tenantId: context.tenantId,
          orderId,
          productId: product.id,
          nameSnapshot: product.name,
          quantity: String(input.quantity),
          unitPriceCents: product.priceCents,
          totalCents: total.totalCents,
          notes: input.notes,
          modifiers: input.modifiers ?? [],
        })
        .returning();

      const nextSubtotal = order.subtotalCents + total.totalCents;
      await tx
        .update(orders)
        .set({
          subtotalCents: nextSubtotal,
          totalCents:
            nextSubtotal - order.discountCents + order.serviceChargeCents + order.deliveryFeeCents,
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      return {
        ...item,
        audit: "order.item_added",
      };
    });
  }

  async sendToKitchen(context: TenantContext, orderId: string) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      stateMachines.assertOrderTransition(order.status, "sent_to_kitchen");

      const stations = await tx
        .select()
        .from(kdsStations)
        .where(
          and(eq(kdsStations.tenantId, context.tenantId), eq(kdsStations.branchId, order.branchId)),
        );

      await tx
        .update(orderItems)
        .set({ status: "sent", sentToKitchenAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));

      const tickets =
        stations.length > 0
          ? await tx
              .insert(kdsTickets)
              .values(
                stations.map((station) => ({
                  tenantId: context.tenantId,
                  branchId: order.branchId,
                  stationId: station.id,
                  orderId,
                  status: "sent" as const,
                  payload: { source: order.channel, tableId: order.tableId },
                })),
              )
              .returning()
          : [];

      await tx
        .update(orders)
        .set({ status: "sent_to_kitchen", version: order.version + 1, updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      return {
        orderId,
        status: "sent_to_kitchen",
        ticketsCreated: tickets,
        audit: "order.sent_to_kitchen",
      };
    });
  }

  splitBill(orderId: string, totalCents: number, people: number) {
    return {
      orderId,
      parts: splitAmount(totalCents, people).map((amountCents, index) => ({
        person: index + 1,
        amountCents,
      })),
    };
  }

  async registerPayment(context: TenantContext, orderId: string, input: RegisterPaymentInput) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: context.tenantId,
          orderId,
          provider: "manual",
          method: input.method,
          status: "confirmed",
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
          confirmedAt: new Date(),
        })
        .returning();

      const confirmedPayments = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.tenantId, context.tenantId), eq(payments.orderId, orderId)));
      const paidCents = confirmedPayments
        .filter((row) => row.status === "confirmed")
        .reduce((sum, row) => sum + row.amountCents, 0);
      const nextStatus = paidCents >= order.totalCents ? "paid" : "partially_paid";

      await tx
        .update(orders)
        .set({ status: nextStatus, version: order.version + 1, updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      return {
        ...payment,
        orderStatus: nextStatus,
        audit: "payment.confirmed",
      };
    });
  }

  async closeOrder(context: TenantContext, orderId: string) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (order.status !== "paid") {
        throw new Error("Order must be paid before close");
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));
      const productIds = [...new Set(items.map((item) => item.productId))];

      const productRecipes =
        productIds.length > 0
          ? await tx
              .select()
              .from(recipes)
              .where(
                and(eq(recipes.tenantId, context.tenantId), inArray(recipes.productId, productIds)),
              )
          : [];
      const recipeIds = productRecipes.map((recipe) => recipe.id);
      const ingredients =
        recipeIds.length > 0
          ? await tx
              .select()
              .from(recipeItems)
              .where(
                and(
                  eq(recipeItems.tenantId, context.tenantId),
                  inArray(recipeItems.recipeId, recipeIds),
                ),
              )
          : [];
      const [defaultLocation] = await tx
        .select()
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.tenantId, context.tenantId),
            eq(stockLocations.branchId, order.branchId),
          ),
        )
        .limit(1);

      for (const item of items) {
        const recipe = productRecipes.find((entry) => entry.productId === item.productId);
        if (!recipe) {
          continue;
        }

        const itemQuantity = Number(item.quantity);
        for (const ingredient of ingredients.filter((entry) => entry.recipeId === recipe.id)) {
          await tx.insert(stockMovements).values({
            tenantId: context.tenantId,
            branchId: order.branchId,
            inventoryItemId: ingredient.inventoryItemId,
            stockLocationId: defaultLocation?.id,
            type: "sale",
            quantity: String(-Number(ingredient.quantity) * itemQuantity),
            sourceType: "order",
            sourceId: order.id,
            reason: `Baixa automatica do pedido ${order.id}`,
          });
        }
      }

      await tx
        .update(orders)
        .set({ closedAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      if (order.tableId) {
        await tx
          .update(diningTables)
          .set({ status: "free", updatedAt: new Date() })
          .where(eq(diningTables.id, order.tableId));
      }

      return {
        orderId,
        status: "paid",
        fiscalStatus: "pending_when_provider_enabled",
        audit: "order.closed",
      };
    });
  }

  async openCashSession(context: TenantContext, input: OpenCashSessionInput) {
    const [session] = await this.database.db
      .insert(cashSessions)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        operatorId: context.userId ?? "",
        openingAmountCents: input.openingAmountCents,
      })
      .returning();

    return session;
  }

  async closeCashSession(
    context: TenantContext,
    cashSessionId: string,
    input: CloseCashSessionInput,
  ) {
    const [session] = await this.database.db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, cashSessionId)))
      .limit(1);

    if (!session) {
      throw new NotFoundException("Cash session not found");
    }

    stateMachines.assertCashSessionTransition(session.status, "closed");

    const [closed] = await this.database.db
      .update(cashSessions)
      .set({
        status: input.countedAmountCents === session.expectedAmountCents ? "closed" : "disputed",
        countedAmountCents: input.countedAmountCents,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cashSessions.id, session.id))
      .returning();

    return closed;
  }
}
