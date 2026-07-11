import {
  auditLogs,
  branches,
  cashSessions,
  customers,
  diningTables,
  floorPlans,
  kdsStations,
  kdsTickets,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  outboxEvents,
  payments,
  printerDevices,
  printJobs,
  printRoutes,
  products,
  recipeItems,
  recipes,
  stockLocations,
  stockMovements,
  tenants,
  users,
} from "@giromesa/db";
import {
  calculateOrderTotal,
  type PaymentMethod,
  splitAmount,
  stateMachines,
  type TenantContext,
} from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { createPrintProvider } from "../printing/print-provider";
import {
  renderBillPreview,
  renderCashSummary,
  renderPaymentReceipt,
} from "../printing/print-renderer";

type OpenOrderInput = {
  channel: "counter" | "table" | "tab" | "delivery" | "qr";
  branchId: string;
  tableId?: string | undefined;
  customerId?: string | undefined;
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

type UpdateQrOrderItemInput = {
  quantity: number;
  notes?: string | undefined;
};

type RejectQrOrderInput = {
  reason: string;
};

type CancelQrOrderItemInput = {
  reason: string;
};

type OpenCashSessionInput = {
  branchId: string;
  openingAmountCents: number;
};

type CloseCashSessionInput = {
  countedAmountCents: number;
};

export type CashSessionSummary = {
  branchId: string;
  session: {
    id: string;
    status: string;
    openingAmountCents: number;
    expectedAmountCents: number;
    countedAmountCents: number | null;
    differenceCents: number | null;
    openedAt: Date;
    closedAt: Date | null;
  } | null;
  payments: {
    totalCents: number;
    count: number;
    byMethod: Record<string, number>;
  };
  openOrders: {
    count: number;
    totalCents: number;
  };
};

@Injectable()
export class PosService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FiscalService) private readonly fiscalService: FiscalService,
  ) {}

  async listTables(context: TenantContext, branchId: string) {
    return this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)));
  }

  async listQrPendingOrders(context: TenantContext, branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    const rows = await this.database.db
      .select({
        id: orders.id,
        branchId: orders.branchId,
        tableId: orders.tableId,
        tableCode: diningTables.code,
        tableName: diningTables.name,
        status: orders.status,
        subtotalCents: orders.subtotalCents,
        totalCents: orders.totalCents,
        openedAt: orders.openedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(
        diningTables,
        and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, orders.tableId)),
      )
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          eq(orders.channel, "qr"),
          eq(orders.status, "opened"),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(12);

    const orderIds = rows.map((order) => order.id);
    const items =
      orderIds.length > 0
        ? await this.database.db
            .select({
              id: orderItems.id,
              orderId: orderItems.orderId,
              nameSnapshot: orderItems.nameSnapshot,
              quantity: orderItems.quantity,
              totalCents: orderItems.totalCents,
              notes: orderItems.notes,
            })
            .from(orderItems)
            .where(
              and(
                eq(orderItems.tenantId, context.tenantId),
                inArray(orderItems.orderId, orderIds),
                eq(orderItems.status, "pending"),
              ),
            )
            .orderBy(orderItems.createdAt)
        : [];

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const group = itemsByOrder.get(item.orderId) ?? [];
      group.push(item);
      itemsByOrder.set(item.orderId, group);
    }

    return rows.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
    }));
  }

  async getOperationalEventSnapshot(context: TenantContext, branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    const [latestAudit] = await this.database.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, context.tenantId), eq(auditLogs.branchId, branchId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    const [latestTicket] = await this.database.db
      .select({
        id: kdsTickets.id,
        status: kdsTickets.status,
        updatedAt: kdsTickets.updatedAt,
        createdAt: kdsTickets.createdAt,
      })
      .from(kdsTickets)
      .where(and(eq(kdsTickets.tenantId, context.tenantId), eq(kdsTickets.branchId, branchId)))
      .orderBy(desc(kdsTickets.updatedAt))
      .limit(1);

    const [latestOutbox] = await this.database.db
      .select({
        id: outboxEvents.id,
        topic: outboxEvents.topic,
        updatedAt: outboxEvents.updatedAt,
        createdAt: outboxEvents.createdAt,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.tenantId, context.tenantId))
      .orderBy(desc(outboxEvents.updatedAt))
      .limit(1);

    const signature = [
      latestAudit ? `${latestAudit.id}:${latestAudit.createdAt.toISOString()}` : "audit:none",
      latestTicket ? `${latestTicket.id}:${latestTicket.updatedAt.toISOString()}` : "kds:none",
      latestOutbox ? `${latestOutbox.id}:${latestOutbox.updatedAt.toISOString()}` : "outbox:none",
    ].join("|");

    return {
      tenantId: context.tenantId,
      branchId,
      signature,
      emittedAt: new Date().toISOString(),
      latestAudit: latestAudit
        ? {
            id: latestAudit.id,
            action: latestAudit.action,
            createdAt: latestAudit.createdAt.toISOString(),
          }
        : null,
      latestTicket: latestTicket
        ? {
            id: latestTicket.id,
            status: latestTicket.status,
            updatedAt: latestTicket.updatedAt.toISOString(),
          }
        : null,
      latestOutbox: latestOutbox
        ? {
            id: latestOutbox.id,
            topic: latestOutbox.topic,
            updatedAt: latestOutbox.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async listTableHistory(context: TenantContext, tableId: string, limit = 24) {
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .limit(1);

    if (!table) {
      throw new NotFoundException("Table not found");
    }

    const tableOrders = await this.database.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.tableId, tableId)))
      .orderBy(desc(orders.createdAt))
      .limit(40);

    const orderIds = tableOrders.map((order) => order.id);
    const entityFilters = [
      and(eq(auditLogs.entityType, "dining_table"), eq(auditLogs.entityId, tableId)),
      ...(orderIds.length > 0
        ? [and(eq(auditLogs.entityType, "order"), inArray(auditLogs.entityId, orderIds))]
        : []),
    ];

    return this.database.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, and(eq(users.tenantId, context.tenantId), eq(users.id, auditLogs.userId)))
      .where(and(eq(auditLogs.tenantId, context.tenantId), or(...entityFilters)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  async updateQrOrderItem(
    context: TenantContext,
    orderId: string,
    itemId: string,
    input: UpdateQrOrderItemInput,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.id, orderId),
            eq(orders.channel, "qr"),
            eq(orders.status, "opened"),
          ),
        )
        .limit(1);

      if (!order) {
        throw new NotFoundException("QR order not found or already processed");
      }

      const [item] = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.id, itemId),
            eq(orderItems.status, "pending"),
          ),
        )
        .limit(1);

      if (!item) {
        throw new NotFoundException("QR order item not found");
      }

      const quantity = Number(input.quantity.toFixed(3));
      const totalCents = calculateOrderTotal({
        lines: [{ quantity, unitPriceCents: item.unitPriceCents }],
      }).totalCents;

      const [updatedItem] = await tx
        .update(orderItems)
        .set({
          quantity: String(quantity),
          totalCents,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.id, itemId),
            eq(orderItems.status, "pending"),
          ),
        )
        .returning();

      const orderItemsForTotal = await tx
        .select({ totalCents: orderItems.totalCents })
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));
      const subtotalCents = orderItemsForTotal.reduce((sum, row) => sum + row.totalCents, 0);

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          subtotalCents,
          totalCents:
            subtotalCents - order.discountCents + order.serviceChargeCents + order.deliveryFeeCents,
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .returning();

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "qr_order.item_updated",
        entityType: "order",
        entityId: order.id,
        metadata: {
          itemId,
          name: item.nameSnapshot,
          previousQuantity: item.quantity,
          quantity: String(quantity),
          previousNotes: item.notes,
          notes: input.notes ?? null,
        },
      });

      return {
        order: updatedOrder,
        item: updatedItem,
        audit: "qr_order.item_updated",
      };
    });
  }

  async cancelQrOrderItem(
    context: TenantContext,
    orderId: string,
    itemId: string,
    input: CancelQrOrderItemInput,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.id, orderId),
            eq(orders.channel, "qr"),
            eq(orders.status, "opened"),
          ),
        )
        .limit(1);

      if (!order) {
        throw new NotFoundException("QR order not found or already processed");
      }

      const [item] = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.id, itemId),
            eq(orderItems.status, "pending"),
          ),
        )
        .limit(1);

      if (!item) {
        throw new NotFoundException("QR order item not found or already canceled");
      }

      const [updatedItem] = await tx
        .update(orderItems)
        .set({
          status: "canceled",
          totalCents: 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.id, itemId),
            eq(orderItems.status, "pending"),
          ),
        )
        .returning();

      const remainingItems = await tx
        .select({ id: orderItems.id, totalCents: orderItems.totalCents })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.status, "pending"),
          ),
        );

      const subtotalCents = remainingItems.reduce((sum, row) => sum + row.totalCents, 0);
      const nextStatus = remainingItems.length > 0 ? order.status : "canceled";

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: nextStatus,
          subtotalCents,
          totalCents:
            subtotalCents - order.discountCents + order.serviceChargeCents + order.deliveryFeeCents,
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .returning();

      if (nextStatus === "canceled" && order.tableId) {
        await tx
          .update(diningTables)
          .set({ status: "occupied", updatedAt: new Date() })
          .where(
            and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
          );
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "qr_order.item_canceled",
        entityType: "order",
        entityId: order.id,
        metadata: {
          itemId,
          name: item.nameSnapshot,
          previousQuantity: item.quantity,
          previousTotalCents: item.totalCents,
          reason: input.reason,
          orderCanceled: nextStatus === "canceled",
        },
      });

      return {
        order: updatedOrder,
        item: updatedItem,
        audit: "qr_order.item_canceled",
      };
    });
  }

  async rejectQrOrder(context: TenantContext, orderId: string, input: RejectQrOrderInput) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.id, orderId),
            eq(orders.channel, "qr"),
            eq(orders.status, "opened"),
          ),
        )
        .limit(1);

      if (!order) {
        throw new NotFoundException("QR order not found or already processed");
      }

      await tx
        .update(orderItems)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));

      const [updatedOrder] = await tx
        .update(orders)
        .set({ status: "canceled", version: order.version + 1, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .returning();

      if (order.tableId) {
        await tx
          .update(diningTables)
          .set({ status: "occupied", updatedAt: new Date() })
          .where(
            and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
          );
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "qr_order.rejected",
        entityType: "order",
        entityId: order.id,
        metadata: { reason: input.reason, tableId: order.tableId },
      });

      return {
        order: updatedOrder,
        audit: "qr_order.rejected",
      };
    });
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
          .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, table.id)));
      }

      if (input.customerId) {
        const [customer] = await tx.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, input.customerId))).limit(1);
        if (!customer) throw new NotFoundException("Customer not found");
      }
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          tableId: input.tableId,
          ...(input.customerId ? { customerId: input.customerId } : {}),
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

  async createTable(context: TenantContext, input: { branchId: string; code: string; name: string; seats: number }) {
    const [table] = await this.database.db.insert(diningTables).values({ tenantId: context.tenantId, branchId: input.branchId, code: input.code.trim().toUpperCase(), name: input.name.trim(), seats: input.seats }).returning();
    if (!table) throw new Error("Failed to create table");
    await this.database.db.insert(auditLogs).values({ tenantId: context.tenantId, branchId: input.branchId, userId: context.userId, requestId: context.requestId, action: "dining_table.created", entityType: "dining_table", entityId: table.id, metadata: { code: table.code, seats: table.seats } });
    return table;
  }

  async getFloorPlan(context: TenantContext, branchId: string) {
    const [plan] = await this.database.db.select().from(floorPlans)
      .where(and(eq(floorPlans.tenantId, context.tenantId), eq(floorPlans.branchId, branchId))).limit(1);
    return { id: plan?.id ?? null, branchId, name: plan?.name ?? "Salão principal", layout: plan?.layout ?? {} };
  }

  async saveFloorPlan(context: TenantContext, input: { branchId: string; layout: Record<string, { x: number; y: number }> }) {
    const [branch] = await this.database.db.select({ id: branches.id }).from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, input.branchId))).limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
    const [existing] = await this.database.db.select({ id: floorPlans.id }).from(floorPlans)
      .where(and(eq(floorPlans.tenantId, context.tenantId), eq(floorPlans.branchId, input.branchId), eq(floorPlans.name, "Salão principal"))).limit(1);
    const [plan] = existing
      ? await this.database.db.update(floorPlans).set({ layout: input.layout, updatedAt: new Date() }).where(eq(floorPlans.id, existing.id)).returning()
      : await this.database.db.insert(floorPlans).values({ tenantId: context.tenantId, branchId: input.branchId, name: "Salão principal", layout: input.layout }).returning();
    if (!plan) throw new Error("Failed to save floor plan");
    await this.database.db.insert(auditLogs).values({ tenantId: context.tenantId, branchId: input.branchId, userId: context.userId, requestId: context.requestId, action: "floor_plan.updated", entityType: "floor_plan", entityId: plan.id, metadata: { tableCount: Object.keys(input.layout).length } });
    return plan;
  }

  async assignCustomer(context: TenantContext, orderId: string, customerId: string) {
    const [customer] = await this.database.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, customerId))).limit(1);
    if (!customer) throw new NotFoundException("Customer not found");
    const [order] = await this.database.db.update(orders).set({ customerId, updatedAt: new Date() })
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId))).returning();
    if (!order) throw new NotFoundException("Order not found");
    await this.database.db.insert(auditLogs).values({ tenantId: context.tenantId, branchId: order.branchId, userId: context.userId, requestId: context.requestId, action: "order.customer_assigned", entityType: "order", entityId: order.id, metadata: { customerId } });
    return { ...order, audit: "order.customer_assigned" };
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

      const selectedOptionIds = (input.modifiers ?? [])
        .map((modifier) => typeof modifier.optionId === "string" ? modifier.optionId : null)
        .filter((optionId): optionId is string => Boolean(optionId));
      const selectedOptions = selectedOptionIds.length
        ? await tx.select().from(modifierOptions).where(and(eq(modifierOptions.tenantId, context.tenantId), inArray(modifierOptions.id, selectedOptionIds), eq(modifierOptions.isAvailable, true)))
        : [];
      if (selectedOptions.length !== selectedOptionIds.length) throw new BadRequestException("One or more modifiers are unavailable");
      const groups = selectedOptions.length
        ? await tx.select().from(modifierGroups).where(and(eq(modifierGroups.tenantId, context.tenantId), eq(modifierGroups.productId, product.id)))
        : [];
      const selectedByGroup = new Map<string, number>();
      for (const option of selectedOptions) selectedByGroup.set(option.groupId, (selectedByGroup.get(option.groupId) ?? 0) + 1);
      for (const group of groups) {
        const selected = selectedByGroup.get(group.id) ?? 0;
        if ((group.isRequired && selected < group.minChoices) || selected < group.minChoices || selected > group.maxChoices) throw new BadRequestException(`Invalid choices for modifier group ${group.name}`);
      }
      const modifierDeltaCents = selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0);
      const total = calculateOrderTotal({ lines: [{ quantity: input.quantity, unitPriceCents: product.priceCents + modifierDeltaCents }] });

      const [item] = await tx
        .insert(orderItems)
        .values({
          tenantId: context.tenantId,
          orderId,
          productId: product.id,
          nameSnapshot: product.name,
          quantity: String(input.quantity),
          unitPriceCents: product.priceCents + modifierDeltaCents,
          totalCents: total.totalCents,
          notes: input.notes,
          modifiers: selectedOptions.map((option) => ({ optionId: option.id, groupId: option.groupId, name: option.name, priceDeltaCents: option.priceDeltaCents })),
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
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)));

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

      const pendingItems = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.status, "pending"),
          ),
        );

      if (pendingItems.length === 0) {
        throw new BadRequestException("Order has no pending items to send");
      }

      const stations = await tx
        .select()
        .from(kdsStations)
        .where(
          and(eq(kdsStations.tenantId, context.tenantId), eq(kdsStations.branchId, order.branchId)),
        );

      await tx
        .update(orderItems)
        .set({ status: "sent", sentToKitchenAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.status, "pending"),
          ),
        );

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

      const printJobsCreated =
        tickets.length > 0
          ? await this.createKitchenPrintJobs(tx, context, {
              order,
              tickets,
              stationIds: stations.map((station) => station.id),
            })
          : [];

      await tx
        .update(orders)
        .set({ status: "sent_to_kitchen", version: order.version + 1, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)));

      if (order.tableId) {
        await tx
          .update(diningTables)
          .set({ status: "order_sent", updatedAt: new Date() })
          .where(
            and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
          );
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "order.sent_to_kitchen",
        entityType: "order",
        entityId: order.id,
        metadata: {
          channel: order.channel,
          tableId: order.tableId,
          ticketsCreated: tickets.length,
          printJobsCreated: printJobsCreated.length,
        },
      });

      return {
        orderId,
        status: "sent_to_kitchen",
        ticketsCreated: tickets,
        printJobsCreated,
        audit: "order.sent_to_kitchen",
      };
    });
  }

  private async createKitchenPrintJobs(
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
    context: TenantContext,
    input: {
      order: typeof orders.$inferSelect;
      tickets: (typeof kdsTickets.$inferSelect)[];
      stationIds: string[];
    },
  ) {
    const routes = await tx
      .select({
        id: printRoutes.id,
        branchId: printRoutes.branchId,
        stationId: printRoutes.stationId,
        targetType: printRoutes.targetType,
        copies: printRoutes.copies,
        printerDeviceId: printRoutes.printerDeviceId,
        printerName: printerDevices.name,
        printerAddress: printerDevices.address,
        printerPort: printerDevices.port,
        printerConnectionType: printerDevices.connectionType,
        printerConfig: printerDevices.config,
        charactersPerLine: printerDevices.charactersPerLine,
        stationName: kdsStations.name,
      })
      .from(printRoutes)
      .innerJoin(printerDevices, eq(printerDevices.id, printRoutes.printerDeviceId))
      .leftJoin(kdsStations, eq(kdsStations.id, printRoutes.stationId))
      .where(
        and(
          eq(printRoutes.tenantId, context.tenantId),
          eq(printRoutes.branchId, input.order.branchId),
          eq(printRoutes.trigger, "kds_ticket_created"),
          eq(printRoutes.isActive, true),
          eq(printerDevices.isActive, true),
        ),
      );

    const activeRoutes = routes.filter(
      (route) => !route.stationId || input.stationIds.includes(route.stationId),
    );

    if (activeRoutes.length === 0) {
      return [];
    }

    const items = await tx
      .select({
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, input.order.id),
          inArray(orderItems.status, ["pending", "sent", "preparing", "ready", "served"]),
        ),
      );

    const [table] = input.order.tableId
      ? await tx
          .select({ code: diningTables.code })
          .from(diningTables)
          .where(
            and(
              eq(diningTables.tenantId, context.tenantId),
              eq(diningTables.id, input.order.tableId),
            ),
          )
          .limit(1)
      : [];

    const printProvider = createPrintProvider();
    const createdJobs = [];
    const [tenant] = await tx
      .select({ name: tenants.name, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);
    const tenantName = readTenantDisplayName(tenant?.settings, tenant?.name ?? "GiroMesa");

    for (const ticket of input.tickets) {
      const matchingRoutes = activeRoutes.filter(
        (route) => !route.stationId || route.stationId === ticket.stationId,
      );

      for (const route of matchingRoutes) {
        const rendered = printProvider.renderKitchenTicket({
          tenantName,
          stationName: route.stationName ?? route.targetType,
          orderCode: input.order.id.slice(0, 8),
          orderChannel: input.order.channel,
          ...(table?.code ? { tableCode: table.code } : {}),
          items,
          createdAt: new Date().toISOString(),
          copies: route.copies,
          charactersPerLine: route.charactersPerLine,
        });

        if (!rendered.ok || !rendered.data) {
          continue;
        }

        const [job] = await tx
          .insert(printJobs)
          .values({
            tenantId: context.tenantId,
            branchId: input.order.branchId,
            printerDeviceId: route.printerDeviceId,
            printRouteId: route.id,
            kdsTicketId: ticket.id,
            orderId: input.order.id,
            requestedByUserId: context.userId,
            kind: route.targetType,
            status: "pending",
            idempotencyKey: `kds:${ticket.id}:route:${route.id}`,
            copies: route.copies,
            payload: {
              source: "kds_ticket_created",
              stationId: ticket.stationId,
              printerName: route.printerName,
              printerHost: route.printerAddress,
              printerPort: route.printerPort,
              printerConnectionType: route.printerConnectionType,
              printerConfig: route.printerConfig,
            },
            renderedText: rendered.data.renderedText,
          })
          .onConflictDoNothing()
          .returning();

        if (job) {
          createdJobs.push(job);
        }
      }
    }

    return createdJobs;
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
        .onConflictDoNothing({
          target: [payments.tenantId, payments.idempotencyKey],
        })
        .returning();

      const resolvedPayment =
        payment ??
        (
          await tx
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.tenantId, context.tenantId),
                eq(payments.idempotencyKey, input.idempotencyKey),
              ),
            )
            .limit(1)
        )[0];

      if (!resolvedPayment) {
        throw new Error("Failed to register payment");
      }

      if (resolvedPayment.orderId !== orderId) {
        throw new ConflictException("Idempotency key already used for another order");
      }

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
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)));

      if (payment) {
        const [openCashSession] = await tx
          .select({ id: cashSessions.id, expectedAmountCents: cashSessions.expectedAmountCents })
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.tenantId, context.tenantId),
              eq(cashSessions.branchId, order.branchId),
              eq(cashSessions.status, "open"),
            ),
          )
          .orderBy(desc(cashSessions.openedAt))
          .limit(1);

        if (openCashSession) {
          await tx
            .update(cashSessions)
            .set({
              expectedAmountCents:
                openCashSession.expectedAmountCents + resolvedPayment.amountCents,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(cashSessions.tenantId, context.tenantId),
                eq(cashSessions.id, openCashSession.id),
              ),
            );
        }

        await tx.insert(auditLogs).values({
          tenantId: context.tenantId,
          branchId: order.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "payment.confirmed",
          entityType: "order",
          entityId: order.id,
          metadata: {
            paymentId: resolvedPayment.id,
            method: resolvedPayment.method,
            amountCents: resolvedPayment.amountCents,
            orderStatus: nextStatus,
          },
        });

        await tx.insert(outboxEvents).values({
          tenantId: context.tenantId,
          topic: "payment.confirmed",
          payload: {
            paymentId: resolvedPayment.id,
            orderId: order.id,
            branchId: order.branchId,
            amountCents: resolvedPayment.amountCents,
            method: resolvedPayment.method,
            status: resolvedPayment.status,
            orderStatus: nextStatus,
          },
        });
      }

      return {
        ...resolvedPayment,
        orderStatus: nextStatus,
        audit: "payment.confirmed",
      };
    });
  }

  async listOrderPayments(context: TenantContext, orderId: string) {
    const [order] = await this.database.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
      .limit(1);

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const rows = await this.database.db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        method: payments.method,
        status: payments.status,
        confirmedAt: payments.confirmedAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.orderId, orderId)))
      .orderBy(desc(payments.confirmedAt), desc(payments.createdAt));

    return rows.map((row) => ({
      ...row,
      audit: row.status === "confirmed" ? "payment.confirmed" : "payment.recorded",
    }));
  }

  async closeOrder(context: TenantContext, orderId: string) {
    const closedOrder = await this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (order.status !== "paid") {
        throw new BadRequestException("Order must be paid before close");
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            inArray(orderItems.status, ["pending", "sent", "preparing", "ready", "served"]),
          ),
        );
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

      let stockMovementsCreated = 0;
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
          stockMovementsCreated += 1;
        }
      }

      await tx
        .update(orders)
        .set({ status: "paid", closedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)));

      if (order.tableId) {
        await tx
          .update(diningTables)
          .set({ status: "free", updatedAt: new Date() })
          .where(
            and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
          );
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "order.closed",
        entityType: "order",
        entityId: order.id,
        metadata: {
          tableId: order.tableId,
          totalCents: order.totalCents,
          stockMovementsCreated,
        },
      });

      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "order.closed",
        payload: {
          orderId: order.id,
          branchId: order.branchId,
          tableId: order.tableId,
          channel: order.channel,
          totalCents: order.totalCents,
          closedAt: new Date().toISOString(),
        },
      });

      return {
        orderId,
        status: "paid",
        fiscalStatus: "pending",
        audit: "order.closed",
      };
    });

    try {
      const fiscalDocument = await this.fiscalService.createPendingOrderDocument(context, orderId);
      return {
        ...closedOrder,
        fiscalDocumentId: fiscalDocument.id,
        fiscalStatus: fiscalDocument.status,
      };
    } catch (error) {
      return {
        ...closedOrder,
        fiscalStatus: "error",
        fiscalError: error instanceof Error ? error.message : "Fiscal pending creation failed",
      };
    }
  }

  async openCashSession(context: TenantContext, input: OpenCashSessionInput) {
    const [session] = await this.database.db
      .insert(cashSessions)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        operatorId: context.userId ?? "",
        openingAmountCents: input.openingAmountCents,
        expectedAmountCents: input.openingAmountCents,
      })
      .returning();

    return session;
  }

  async getCashSessionSummary(
    context: TenantContext,
    branchId: string,
  ): Promise<CashSessionSummary> {
    const [session] = await this.database.db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.branchId, branchId)))
      .orderBy(desc(cashSessions.openedAt))
      .limit(1);

    const [paymentsTotal] = await this.database.db
      .select({
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
        count: sql<number>`count(${payments.id})`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.status, "confirmed"),
          eq(orders.branchId, branchId),
          session ? sql`${payments.confirmedAt} >= ${session.openedAt}` : sql`true`,
          session?.closedAt ? sql`${payments.confirmedAt} <= ${session.closedAt}` : sql`true`,
        ),
      );

    const paymentRows = await this.database.db
      .select({
        method: payments.method,
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.status, "confirmed"),
          eq(orders.branchId, branchId),
          session ? sql`${payments.confirmedAt} >= ${session.openedAt}` : sql`true`,
          session?.closedAt ? sql`${payments.confirmedAt} <= ${session.closedAt}` : sql`true`,
        ),
      )
      .groupBy(payments.method);

    const [openOrders] = await this.database.db
      .select({
        count: sql<number>`count(${orders.id})`,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          inArray(orders.status, [
            "opened",
            "sent_to_kitchen",
            "preparing",
            "ready",
            "served",
            "waiting_payment",
            "partially_paid",
          ]),
        ),
      );

    return {
      branchId,
      session: session
        ? {
            id: session.id,
            status: session.status,
            openingAmountCents: session.openingAmountCents,
            expectedAmountCents: session.expectedAmountCents,
            countedAmountCents: session.countedAmountCents,
            differenceCents:
              session.countedAmountCents === null
                ? null
                : session.countedAmountCents - session.expectedAmountCents,
            openedAt: session.openedAt,
            closedAt: session.closedAt,
          }
        : null,
      payments: {
        totalCents: Number(paymentsTotal?.totalCents ?? 0),
        count: Number(paymentsTotal?.count ?? 0),
        byMethod: Object.fromEntries(
          paymentRows.map((row) => [row.method, Number(row.totalCents ?? 0)]),
        ),
      },
      openOrders: {
        count: Number(openOrders?.count ?? 0),
        totalCents: Number(openOrders?.totalCents ?? 0),
      },
    };
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

    if (session.status !== "open") {
      throw new BadRequestException("Cash session is no longer open");
    }

    const [openOrders] = await this.database.db
      .select({
        count: sql<number>`count(${orders.id})::int`,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, session.branchId),
          inArray(orders.status, [
            "opened",
            "sent_to_kitchen",
            "preparing",
            "ready",
            "served",
            "waiting_payment",
            "partially_paid",
          ]),
        ),
      );

    if (Number(openOrders?.count ?? 0) > 0) {
      throw new BadRequestException("Close or settle open orders before closing the cash session");
    }

    const nextStatus =
      input.countedAmountCents === session.expectedAmountCents ? "closed" : "disputed";
    stateMachines.assertCashSessionTransition(session.status, nextStatus);
    const differenceCents = input.countedAmountCents - session.expectedAmountCents;

    const [closed] = await this.database.db
      .update(cashSessions)
      .set({
        status: nextStatus,
        countedAmountCents: input.countedAmountCents,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, session.id)))
      .returning();

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: session.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: nextStatus === "disputed" ? "cash_session.disputed" : "cash_session.closed",
      entityType: "cash_session",
      entityId: session.id,
      metadata: {
        openingAmountCents: session.openingAmountCents,
        expectedAmountCents: session.expectedAmountCents,
        countedAmountCents: input.countedAmountCents,
        differenceCents,
      },
    });

    await this.database.db.insert(outboxEvents).values({
      tenantId: context.tenantId,
      topic: "cash_session.closed",
      payload: {
        cashSessionId: session.id,
        branchId: session.branchId,
        status: nextStatus,
        expectedAmountCents: session.expectedAmountCents,
        countedAmountCents: input.countedAmountCents,
        differenceCents,
        closedAt: new Date().toISOString(),
      },
    });

    return {
      ...closed,
      differenceCents,
      audit: nextStatus === "disputed" ? "cash_session.disputed" : "cash_session.closed",
    };
  }

  async printBillPreview(context: TenantContext, orderId: string) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const [route] = await tx
        .select({
          id: printRoutes.id,
          printerDeviceId: printRoutes.printerDeviceId,
          copies: printRoutes.copies,
          printerName: printerDevices.name,
          charactersPerLine: printerDevices.charactersPerLine,
          printerAddress: printerDevices.address,
          printerPort: printerDevices.port,
          printerConnectionType: printerDevices.connectionType,
          printerConfig: printerDevices.config,
        })
        .from(printRoutes)
        .innerJoin(printerDevices, eq(printerDevices.id, printRoutes.printerDeviceId))
        .where(
          and(
            eq(printRoutes.tenantId, context.tenantId),
            eq(printRoutes.branchId, order.branchId),
            eq(printRoutes.targetType, "bill_preview"),
            eq(printRoutes.isActive, true),
            eq(printerDevices.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active bill preview print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenants.name, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      const [table] = order.tableId
        ? await tx
            .select({ code: diningTables.code })
            .from(diningTables)
            .where(
              and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
            )
            .limit(1)
        : [];
      const items = await tx
        .select({
          name: orderItems.nameSnapshot,
          quantity: orderItems.quantity,
          totalCents: orderItems.totalCents,
        })
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, order.id)));

      const renderedText = renderBillPreview({
        tenantName: readTenantDisplayName(tenant?.settings, tenant?.name ?? "GiroMesa"),
        orderCode: order.id.slice(0, 8),
        tableCode: table?.code ?? null,
        items,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        serviceChargeCents: order.serviceChargeCents,
        totalCents: order.totalCents,
        createdAt: new Date().toISOString(),
        charactersPerLine: route.charactersPerLine,
      });

      const [job] = await tx
        .insert(printJobs)
        .values({
          tenantId: context.tenantId,
          branchId: order.branchId,
          printerDeviceId: route.printerDeviceId,
          printRouteId: route.id,
          orderId: order.id,
          requestedByUserId: context.userId,
          kind: "bill_preview",
          status: "pending",
          idempotencyKey: `bill-preview:${order.id}:${Date.now()}`,
          copies: route.copies,
          payload: {
            source: "manual_bill_preview",
            printerName: route.printerName,
            printerHost: route.printerAddress,
            printerPort: route.printerPort,
            printerConnectionType: route.printerConnectionType,
            printerConfig: route.printerConfig,
          },
          renderedText,
        })
        .returning();

      if (!job) {
        throw new Error("Failed to create bill preview print job");
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "printer.bill_preview_requested",
        entityType: "order",
        entityId: order.id,
        metadata: { printJobId: job.id, routeId: route.id },
      });

      return job;
    });
  }

  async printPaymentReceipt(context: TenantContext, orderId: string) {
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
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.orderId, order.id),
            eq(payments.status, "confirmed"),
          ),
        )
        .orderBy(desc(payments.confirmedAt), desc(payments.createdAt))
        .limit(1);

      if (!payment) {
        throw new BadRequestException("No confirmed payment found for this order");
      }

      const [route] = await tx
        .select({
          id: printRoutes.id,
          printerDeviceId: printRoutes.printerDeviceId,
          copies: printRoutes.copies,
          printerName: printerDevices.name,
          charactersPerLine: printerDevices.charactersPerLine,
          printerAddress: printerDevices.address,
          printerPort: printerDevices.port,
          printerConnectionType: printerDevices.connectionType,
          printerConfig: printerDevices.config,
        })
        .from(printRoutes)
        .innerJoin(printerDevices, eq(printerDevices.id, printRoutes.printerDeviceId))
        .where(
          and(
            eq(printRoutes.tenantId, context.tenantId),
            eq(printRoutes.branchId, order.branchId),
            eq(printRoutes.targetType, "payment_receipt"),
            eq(printRoutes.isActive, true),
            eq(printerDevices.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active payment receipt print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenants.name, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      const [table] = order.tableId
        ? await tx
            .select({ code: diningTables.code })
            .from(diningTables)
            .where(
              and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, order.tableId)),
            )
            .limit(1)
        : [];
      const [operator] = context.userId
        ? await tx
            .select({ name: users.name })
            .from(users)
            .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
            .limit(1)
        : [];

      const renderedText = renderPaymentReceipt({
        tenantName: readTenantDisplayName(tenant?.settings, tenant?.name ?? "GiroMesa"),
        orderCode: order.id.slice(0, 8),
        tableCode: table?.code ?? null,
        operatorName: operator?.name ?? null,
        paymentMethod: payment.method,
        amountCents: payment.amountCents,
        paidAt: (payment.confirmedAt ?? payment.createdAt).toISOString(),
        charactersPerLine: route.charactersPerLine,
      });

      const [job] = await tx
        .insert(printJobs)
        .values({
          tenantId: context.tenantId,
          branchId: order.branchId,
          printerDeviceId: route.printerDeviceId,
          printRouteId: route.id,
          orderId: order.id,
          requestedByUserId: context.userId,
          kind: "payment_receipt",
          status: "pending",
          idempotencyKey: `payment-receipt:${payment.id}:${Date.now()}`,
          copies: route.copies,
          payload: {
            source: "manual_payment_receipt",
            paymentId: payment.id,
            printerName: route.printerName,
            printerHost: route.printerAddress,
            printerPort: route.printerPort,
            printerConnectionType: route.printerConnectionType,
            printerConfig: route.printerConfig,
          },
          renderedText,
        })
        .returning();

      if (!job) {
        throw new Error("Failed to create payment receipt print job");
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "printer.payment_receipt_requested",
        entityType: "payment",
        entityId: payment.id,
        metadata: { printJobId: job.id, routeId: route.id, orderId: order.id },
      });

      return job;
    });
  }

  async printCashSummary(context: TenantContext, cashSessionId: string) {
    return this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, cashSessionId)))
        .limit(1);

      if (!session) {
        throw new NotFoundException("Cash session not found");
      }

      const [route] = await tx
        .select({
          id: printRoutes.id,
          printerDeviceId: printRoutes.printerDeviceId,
          copies: printRoutes.copies,
          printerName: printerDevices.name,
          charactersPerLine: printerDevices.charactersPerLine,
          printerAddress: printerDevices.address,
          printerPort: printerDevices.port,
          printerConnectionType: printerDevices.connectionType,
          printerConfig: printerDevices.config,
        })
        .from(printRoutes)
        .innerJoin(printerDevices, eq(printerDevices.id, printRoutes.printerDeviceId))
        .where(
          and(
            eq(printRoutes.tenantId, context.tenantId),
            eq(printRoutes.branchId, session.branchId),
            eq(printRoutes.targetType, "cash_summary"),
            eq(printRoutes.isActive, true),
            eq(printerDevices.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active cash summary print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenants.name, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      const [operator] = await tx
        .select({ name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, context.tenantId), eq(users.id, session.operatorId)))
        .limit(1);
      const paymentRows = await tx
        .select({
          method: payments.method,
          amountCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(orders.branchId, session.branchId),
            eq(payments.status, "confirmed"),
            sql`${payments.createdAt} >= ${session.openedAt}`,
          ),
        )
        .groupBy(payments.method);

      const renderedText = renderCashSummary({
        tenantName: readTenantDisplayName(tenant?.settings, tenant?.name ?? "GiroMesa"),
        operatorName: operator?.name ?? null,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        openingAmountCents: session.openingAmountCents,
        expectedAmountCents: session.expectedAmountCents,
        countedAmountCents: session.countedAmountCents,
        payments: paymentRows.map((payment) => ({
          method: payment.method,
          amountCents: Number(payment.amountCents),
        })),
        charactersPerLine: route.charactersPerLine,
      });

      const [job] = await tx
        .insert(printJobs)
        .values({
          tenantId: context.tenantId,
          branchId: session.branchId,
          printerDeviceId: route.printerDeviceId,
          printRouteId: route.id,
          requestedByUserId: context.userId,
          kind: "cash_summary",
          status: "pending",
          idempotencyKey: `cash-summary:${session.id}:${Date.now()}`,
          copies: route.copies,
          payload: {
            source: "manual_cash_summary",
            cashSessionId: session.id,
            printerName: route.printerName,
            printerHost: route.printerAddress,
            printerPort: route.printerPort,
            printerConnectionType: route.printerConnectionType,
            printerConfig: route.printerConfig,
          },
          renderedText,
        })
        .returning();

      if (!job) {
        throw new Error("Failed to create cash summary print job");
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: session.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "printer.cash_summary_requested",
        entityType: "cash_session",
        entityId: session.id,
        metadata: { printJobId: job.id, routeId: route.id },
      });

      return job;
    });
  }
}

function readTenantDisplayName(
  settings: Record<string, unknown> | undefined,
  fallbackName: string,
) {
  const rawBranding =
    settings && typeof settings.branding === "object" && settings.branding !== null
      ? (settings.branding as Record<string, unknown>)
      : {};
  return typeof rawBranding.displayName === "string" && rawBranding.displayName.trim()
    ? rawBranding.displayName.trim()
    : fallbackName;
}
