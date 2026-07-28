import {
  auditLogs,
  diningTables,
  inventoryItems,
  kdsTickets,
  orderItems,
  orders,
  outboxEvents,
  printJobs,
  printRoutes,
  stockMovements,
} from "@giromesa/db";
import {
  calculateOrderTotal,
  type PaymentMethod,
  type TableStatus,
  type TenantContext,
} from "@giromesa/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createCounter, createHistogram } from "../../common/metrics";
import {
  type ApprovalApplicator,
  ApprovalApplicatorRegistry,
  type ApprovalRecord,
  ApprovalsService,
} from "../approvals/approvals.service";
import { DatabaseService } from "../database/database.service";
import { appendCancellationNotice, buildStockReversals } from "./cancellation-propagation";
import { CashService } from "./cash.service";
import { decideDiscountFlow, requiresCancellationApproval } from "./operational-exceptions";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "./payments.service";
import { PosRepository } from "./pos.repository";
import { ShiftService } from "./shift.service";

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
  registeredVia?: "waiter" | "cashier" | undefined;
  reference?: string | undefined;
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

type CashMovementInput = {
  branchId: string;
  amountCents: number;
  reason: string;
};

type CloseCashSessionInput = {
  countedAmountCents: number;
};

type OpenShiftInput = {
  branchId: string;
  notes?: string | undefined;
};

type CloseShiftInput = {
  branchId: string;
  notes?: string | undefined;
};

// Business metrics
const orderCount = createCounter("giromesa_orders_total", "Total number of orders created");
const revenueTotal = createCounter("giromesa_revenue_total", "Total revenue in cents");
const orderValueHistogram = createHistogram(
  "giromesa_order_value_cents",
  "Order value distribution in cents",
);

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
  movements: Array<{
    id: string;
    type: string;
    amountCents: number;
    reason: string;
    createdAt: Date;
  }>;
  openOrders: {
    count: number;
    totalCents: number;
  };
};

@Injectable()
export class PosService implements OnModuleInit, ApprovalApplicator {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(CashService) private readonly cashService: CashService,
    @Inject(ShiftService) private readonly shiftService: ShiftService,
    @Optional()
    @Inject(ApprovalsService)
    private readonly approvalsService?: ApprovalsService,
    @Optional()
    @Inject(ApprovalApplicatorRegistry)
    private readonly approvalApplicatorRegistry?: ApprovalApplicatorRegistry,
  ) {}

  onModuleInit() {
    this.approvalApplicatorRegistry?.register(this);
  }

  // --- Table / Floor Plan (delegates to PosRepository) ---

  async listTables(context: TenantContext, branchId: string) {
    return this.posRepository.listTables(context, branchId);
  }

  async createTable(
    context: TenantContext,
    input: { branchId: string; code: string; name: string; seats: number },
  ) {
    return this.posRepository.createTable(context, input);
  }

  async getFloorPlan(context: TenantContext, branchId: string) {
    return this.posRepository.getFloorPlan(context, branchId);
  }

  async saveFloorPlan(
    context: TenantContext,
    input: {
      branchId: string;
      expectedVersion: number;
      layout: Record<string, { x: number; y: number }>;
    },
  ) {
    return this.posRepository.saveFloorPlan(context, input);
  }

  async listTableHistory(context: TenantContext, tableId: string, limit = 24) {
    return this.posRepository.listTableHistory(context, tableId, limit);
  }

  async updateTable(
    context: TenantContext,
    tableId: string,
    data: Partial<{ status: TableStatus; reservedName: string | null }>,
  ) {
    return this.posRepository.updateTable(context, tableId, data);
  }

  async mergeTables(context: TenantContext, branchId: string, tableIds: string[]) {
    return this.posRepository.mergeTables(context, branchId, tableIds);
  }

  async unmergeTables(context: TenantContext, tableId: string) {
    return this.posRepository.unmergeTables(context, tableId);
  }

  // --- Dashboard ---

  async getDashboardSummary(context: TenantContext, branchId: string) {
    const [tables, cashSummary, shift, inventoryAlerts] = await Promise.all([
      this.posRepository.listTables(context, branchId),
      this.cashService.getCashSessionSummary(context, branchId),
      this.shiftService.getCurrentShift(context, branchId),
      this.getInventoryAlertCount(context, branchId),
    ]);

    const occupiedCount = tables.filter((t) => t.status !== "free").length;

    return {
      salesToday: cashSummary.payments.totalCents,
      activeOrders: cashSummary.openOrders.count,
      occupiedTables: `${occupiedCount}/${tables.length}`,
      cashBalance: cashSummary.session?.expectedAmountCents ?? 0,
      shiftOpen: !!shift.shift,
      cashOpen: !!cashSummary.session,
      inventoryAlerts,
    };
  }

  private async getInventoryAlertCount(context: TenantContext, branchId: string) {
    const summary = await this.database.db
      .select({
        id: inventoryItems.id,
        minQuantity: inventoryItems.minQuantity,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(inventoryItems)
      .leftJoin(
        stockMovements,
        and(
          eq(stockMovements.tenantId, inventoryItems.tenantId),
          eq(stockMovements.inventoryItemId, inventoryItems.id),
          eq(stockMovements.branchId, branchId),
        ),
      )
      .where(eq(inventoryItems.tenantId, context.tenantId))
      .groupBy(inventoryItems.id);

    return summary.filter((item) => {
      const quantity = Number(item.quantity);
      const minQuantity = Number(item.minQuantity);
      return quantity < minQuantity;
    }).length;
  }

  // --- QR-specific (stays here) ---

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

  // --- Observability (stays here) ---

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

  // --- Orders (delegates to OrdersService) ---

  async openOrder(context: TenantContext, input: OpenOrderInput) {
    const result = await this.ordersService.openOrder(context, input);
    orderCount.inc({ tenant_id: context.tenantId, channel: input.channel });
    return result;
  }

  async assignCustomer(context: TenantContext, orderId: string, customerId: string) {
    return this.ordersService.assignCustomer(context, orderId, customerId);
  }

  async addItem(context: TenantContext, orderId: string, input: AddItemInput) {
    return this.ordersService.addItem(context, orderId, input);
  }

  async sendToKitchen(context: TenantContext, orderId: string) {
    return this.ordersService.sendToKitchen(context, orderId);
  }

  async closeOrder(context: TenantContext, orderId: string) {
    return this.ordersService.closeOrder(context, orderId);
  }

  async requestDiscount(
    context: TenantContext,
    orderId: string,
    input: { amountCents: number; reason: string },
  ) {
    const [order] = await this.database.db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
      .limit(1);
    if (!order) throw new NotFoundException("Order not found");
    const approvals = this.requireApprovalsService();
    const policy = await approvals.getEffectivePolicy(context);
    const flow = decideDiscountFlow({
      subtotalCents: order.subtotalCents,
      amountCents: input.amountCents,
      maxDiscountWithoutApprovalBps: policy.maxDiscountWithoutApprovalBps,
    });
    if (flow === "invalid") {
      throw new BadRequestException("Discount must be positive and cannot exceed subtotal");
    }
    if (flow === "request_approval") {
      const approval = await approvals.createRequest(context, {
        branchId: order.branchId,
        entityType: "order",
        entityId: order.id,
        action: "order.discount",
        requestedValueCents: input.amountCents,
        reason: input.reason,
        metadata: { orderId: order.id, amountCents: input.amountCents },
      });
      return {
        orderId,
        amountCents: input.amountCents,
        status: "pending_approval",
        approval,
      };
    }
    const updated = await this.applyDiscount(
      context,
      orderId,
      input.amountCents,
      input.reason,
      null,
    );
    return {
      orderId,
      amountCents: input.amountCents,
      status: "applied",
      order: updated,
    };
  }

  async requestItemCancellation(
    context: TenantContext,
    orderId: string,
    itemId: string,
    input: { reason: string },
  ) {
    const [item] = await this.database.db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.id, itemId),
        ),
      )
      .limit(1);
    if (!item) throw new NotFoundException("Order item not found");
    if (item.status === "canceled" || item.status === "refunded") {
      throw new BadRequestException("Order item is already canceled");
    }
    const approvals = this.requireApprovalsService();
    const policy = await approvals.getEffectivePolicy(context);
    if (requiresCancellationApproval(item.status, policy.requireApprovalAfterKitchen)) {
      const approval = await approvals.createRequest(context, {
        branchId: context.branchId ?? null,
        entityType: "order_item",
        entityId: item.id,
        action: "order_item.cancel",
        reason: input.reason,
        metadata: {
          orderId,
          itemId,
          previousStatus: item.status,
          sentToKitchenAt: item.sentToKitchenAt?.toISOString() ?? null,
        },
      });
      return { orderId, itemId, status: "pending_approval", approval };
    }
    const updated = await this.applyItemCancellation(context, orderId, itemId, input.reason, null);
    return { orderId, itemId, status: "canceled", order: updated };
  }

  async applyApproval(context: TenantContext, approval: ApprovalRecord) {
    if (approval.action === "order.discount") {
      const amountCents =
        approval.requestedValueCents ??
        (typeof approval.metadata.amountCents === "number" ? approval.metadata.amountCents : null);
      if (!amountCents) throw new BadRequestException("Approval discount amount is missing");
      await this.applyDiscount(
        context,
        approval.entityId,
        amountCents,
        approval.reason ?? "Approved operational discount",
        approval.id,
      );
      return;
    }
    if (approval.action === "order_item.cancel") {
      const orderId =
        typeof approval.metadata.orderId === "string" ? approval.metadata.orderId : null;
      if (!orderId) throw new BadRequestException("Approval order is missing");
      await this.applyItemCancellation(
        context,
        orderId,
        approval.entityId,
        approval.reason ?? "Approved item cancellation",
        approval.id,
      );
      return;
    }
    throw new BadRequestException(`Unsupported approval action: ${approval.action}`);
  }

  private async applyDiscount(
    context: TenantContext,
    orderId: string,
    amountCents: number,
    reason: string,
    approvalId: string | null,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);
      if (!order) throw new NotFoundException("Order not found");
      if (amountCents > order.subtotalCents) {
        throw new BadRequestException("Discount cannot exceed subtotal");
      }
      if (approvalId && order.discountCents === amountCents) return order;
      const [updated] = await tx
        .update(orders)
        .set({
          discountCents: amountCents,
          totalCents: Math.max(
            0,
            order.subtotalCents - amountCents + order.serviceChargeCents + order.deliveryFeeCents,
          ),
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)))
        .returning();
      if (!updated) throw new NotFoundException("Order not found");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "order.discount_applied",
        entityType: "order",
        entityId: order.id,
        metadata: { amountCents, reason, approvalId },
      });
      return updated;
    });
  }

  private async applyItemCancellation(
    context: TenantContext,
    orderId: string,
    itemId: string,
    reason: string,
    approvalId: string | null,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1);
      const [item] = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, context.tenantId),
            eq(orderItems.orderId, orderId),
            eq(orderItems.id, itemId),
          ),
        )
        .limit(1);
      if (!order || !item) throw new NotFoundException("Order item not found");
      if (item.status === "canceled") return order;
      await tx
        .update(orderItems)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.id, item.id)));
      const remaining = await tx
        .select({ totalCents: orderItems.totalCents, status: orderItems.status })
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, order.id)));
      const subtotalCents = remaining
        .filter((row) => !["canceled", "refunded"].includes(row.status))
        .reduce((sum, row) => sum + row.totalCents, 0);
      const discountCents = Math.min(order.discountCents, subtotalCents);
      const [updated] = await tx
        .update(orders)
        .set({
          subtotalCents,
          discountCents,
          totalCents: Math.max(
            0,
            subtotalCents - discountCents + order.serviceChargeCents + order.deliveryFeeCents,
          ),
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)))
        .returning();
      if (!updated) throw new NotFoundException("Order not found");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "order.item_canceled",
        entityType: "order_item",
        entityId: item.id,
        metadata: { orderId, reason, approvalId, previousStatus: item.status },
      });
      if (item.sentToKitchenAt) {
        const tickets = await tx
          .select()
          .from(kdsTickets)
          .where(
            and(
              eq(kdsTickets.tenantId, context.tenantId),
              eq(kdsTickets.branchId, order.branchId),
              eq(kdsTickets.orderId, order.id),
            ),
          );
        for (const ticket of tickets) {
          await tx
            .update(kdsTickets)
            .set({
              priority: Math.max(ticket.priority, 100),
              payload: appendCancellationNotice(ticket.payload, {
                itemId: item.id,
                name: item.nameSnapshot,
                reason,
              }),
              updatedAt: new Date(),
            })
            .where(and(eq(kdsTickets.tenantId, context.tenantId), eq(kdsTickets.id, ticket.id)));
        }

        const cancellationRoutes = await tx
          .select()
          .from(printRoutes)
          .where(
            and(
              eq(printRoutes.tenantId, context.tenantId),
              eq(printRoutes.branchId, order.branchId),
              eq(printRoutes.trigger, "order_item_canceled"),
              eq(printRoutes.isActive, true),
            ),
          );
        for (const route of cancellationRoutes) {
          await tx
            .insert(printJobs)
            .values({
              tenantId: context.tenantId,
              branchId: order.branchId,
              printerDeviceId: route.printerDeviceId,
              printRouteId: route.id,
              orderId: order.id,
              requestedByUserId: context.userId,
              kind: "order_item_canceled",
              idempotencyKey: `cancel:${item.id}:route:${route.id}`,
              copies: route.copies,
              payload: {
                source: "order_item_canceled",
                itemId: item.id,
                approvalId,
              },
              renderedText: [
                "*** CANCELAMENTO ***",
                `Pedido: ${order.id.slice(0, 8)}`,
                `Item: ${item.nameSnapshot}`,
                `Quantidade: ${item.quantity}`,
                `Motivo: ${reason}`,
              ].join("\n"),
            })
            .onConflictDoNothing();
        }

        const existingReversal = await tx
          .select({ id: stockMovements.id })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.tenantId, context.tenantId),
              eq(stockMovements.branchId, order.branchId),
              eq(stockMovements.sourceType, "order_item_reversal"),
              eq(stockMovements.sourceId, item.id),
            ),
          )
          .limit(1);
        if (!existingReversal[0]) {
          const originalMovements = await tx
            .select()
            .from(stockMovements)
            .where(
              and(
                eq(stockMovements.tenantId, context.tenantId),
                eq(stockMovements.branchId, order.branchId),
                eq(stockMovements.sourceType, "order_item"),
                eq(stockMovements.sourceId, item.id),
                eq(stockMovements.type, "sale"),
              ),
            );
          const reversals = buildStockReversals(originalMovements);
          if (reversals.length > 0) {
            await tx.insert(stockMovements).values(
              reversals.map((reversal, index) => ({
                tenantId: context.tenantId,
                branchId: order.branchId,
                inventoryItemId: reversal.inventoryItemId,
                stockLocationId: originalMovements[index]?.stockLocationId ?? null,
                type: "sale_reversal",
                quantity: reversal.quantity,
                unitCostCents: reversal.unitCostCents,
                sourceType: "order_item_reversal",
                sourceId: item.id,
                reason: `Estorno do item cancelado ${item.id}`,
              })),
            );
          }
        }

        await tx.insert(outboxEvents).values({
          tenantId: context.tenantId,
          topic: "order.item_canceled",
          payload: {
            orderId,
            itemId,
            branchId: order.branchId,
            approvalId,
            previousStatus: item.status,
            sentToKitchenAt: item.sentToKitchenAt?.toISOString() ?? null,
          },
        });
      }
      return updated;
    });
  }

  private requireApprovalsService() {
    if (!this.approvalsService) {
      throw new BadRequestException("Approval service is unavailable");
    }
    return this.approvalsService;
  }

  // --- Payments (delegates to PaymentsService) ---

  splitBill(orderId: string, totalCents: number, people: number) {
    return this.paymentsService.splitBill(orderId, totalCents, people);
  }

  async registerPayment(context: TenantContext, orderId: string, input: RegisterPaymentInput) {
    const result = await this.paymentsService.registerPayment(context, orderId, input);
    revenueTotal.inc({ tenant_id: context.tenantId, method: input.method }, input.amountCents);
    orderValueHistogram.observe({ tenant_id: context.tenantId }, input.amountCents);
    return result;
  }

  async listOrderPayments(context: TenantContext, orderId: string) {
    return this.paymentsService.listOrderPayments(context, orderId);
  }

  async receiveCashHandover(context: TenantContext, paymentId: string) {
    return this.paymentsService.receiveCashHandover(context, paymentId);
  }

  // --- Cash (delegates to CashService) ---

  async getCurrentCashSession(context: TenantContext, branchId: string) {
    return this.cashService.getCurrentCashSession(context, branchId);
  }

  async openCashSession(context: TenantContext, input: OpenCashSessionInput) {
    return this.cashService.openCashSession(context, input);
  }

  async registerCashMovement(
    context: TenantContext,
    type: "supply" | "withdrawal",
    input: CashMovementInput,
  ) {
    return this.cashService.registerCashMovement(context, type, input);
  }

  async getCashSessionSummary(
    context: TenantContext,
    branchId: string,
  ): Promise<CashSessionSummary> {
    return this.cashService.getCashSessionSummary(context, branchId);
  }

  async closeCashSession(
    context: TenantContext,
    cashSessionId: string,
    input: CloseCashSessionInput,
  ) {
    return this.cashService.closeCashSession(context, cashSessionId, input);
  }

  // --- Shifts (delegates to ShiftService) ---

  async getCurrentShift(context: TenantContext, branchId: string) {
    return this.shiftService.getCurrentShift(context, branchId);
  }

  async openShift(context: TenantContext, input: OpenShiftInput) {
    return this.shiftService.openShift(context, input);
  }

  async closeShift(context: TenantContext, input: CloseShiftInput) {
    return this.shiftService.closeShift(context, input);
  }

  // --- Printing (stays here for now) ---

  async printBillPreview(context: TenantContext, orderId: string) {
    return this.database.db.transaction(async (tx) => {
      const {
        orders: ordersTable,
        orderItems: orderItemsTable,
        printRoutes: printRoutesTable,
        printerDevices: printerDevicesTable,
        tenants: tenantsTable,
        diningTables: diningTablesTable,
        printJobs: printJobsTable,
      } = await import("@giromesa/db");

      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.tenantId, context.tenantId), eq(ordersTable.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const [route] = await tx
        .select({
          id: printRoutesTable.id,
          printerDeviceId: printRoutesTable.printerDeviceId,
          copies: printRoutesTable.copies,
          printerName: printerDevicesTable.name,
          charactersPerLine: printerDevicesTable.charactersPerLine,
          printerAddress: printerDevicesTable.address,
          printerPort: printerDevicesTable.port,
          printerConnectionType: printerDevicesTable.connectionType,
          printerConfig: printerDevicesTable.config,
        })
        .from(printRoutesTable)
        .innerJoin(
          printerDevicesTable,
          eq(printerDevicesTable.id, printRoutesTable.printerDeviceId),
        )
        .where(
          and(
            eq(printRoutesTable.tenantId, context.tenantId),
            eq(printRoutesTable.branchId, order.branchId),
            eq(printRoutesTable.targetType, "bill_preview"),
            eq(printRoutesTable.isActive, true),
            eq(printerDevicesTable.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active bill preview print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenantsTable.name, settings: tenantsTable.settings })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, context.tenantId))
        .limit(1);
      const [table] = order.tableId
        ? await tx
            .select({ code: diningTablesTable.code })
            .from(diningTablesTable)
            .where(
              and(
                eq(diningTablesTable.tenantId, context.tenantId),
                eq(diningTablesTable.id, order.tableId),
              ),
            )
            .limit(1)
        : [];
      const items = await tx
        .select({
          name: orderItemsTable.nameSnapshot,
          quantity: orderItemsTable.quantity,
          totalCents: orderItemsTable.totalCents,
        })
        .from(orderItemsTable)
        .where(
          and(
            eq(orderItemsTable.tenantId, context.tenantId),
            eq(orderItemsTable.orderId, order.id),
          ),
        );

      const { renderBillPreview } = await import("../printing/print-renderer");
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
        .insert(printJobsTable)
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
      const {
        orders: ordersTable,
        payments: paymentsTable,
        printRoutes: printRoutesTable,
        printerDevices: printerDevicesTable,
        tenants: tenantsTable,
        diningTables: diningTablesTable,
        printJobs: printJobsTable,
        users: usersTable,
      } = await import("@giromesa/db");

      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.tenantId, context.tenantId), eq(ordersTable.id, orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const [payment] = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.tenantId, context.tenantId),
            eq(paymentsTable.orderId, order.id),
            eq(paymentsTable.status, "confirmed"),
          ),
        )
        .orderBy(desc(paymentsTable.confirmedAt), desc(paymentsTable.createdAt))
        .limit(1);

      if (!payment) {
        throw new BadRequestException("No confirmed payment found for this order");
      }

      const [route] = await tx
        .select({
          id: printRoutesTable.id,
          printerDeviceId: printRoutesTable.printerDeviceId,
          copies: printRoutesTable.copies,
          printerName: printerDevicesTable.name,
          charactersPerLine: printerDevicesTable.charactersPerLine,
          printerAddress: printerDevicesTable.address,
          printerPort: printerDevicesTable.port,
          printerConnectionType: printerDevicesTable.connectionType,
          printerConfig: printerDevicesTable.config,
        })
        .from(printRoutesTable)
        .innerJoin(
          printerDevicesTable,
          eq(printerDevicesTable.id, printRoutesTable.printerDeviceId),
        )
        .where(
          and(
            eq(printRoutesTable.tenantId, context.tenantId),
            eq(printRoutesTable.branchId, order.branchId),
            eq(printRoutesTable.targetType, "payment_receipt"),
            eq(printRoutesTable.isActive, true),
            eq(printerDevicesTable.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active payment receipt print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenantsTable.name, settings: tenantsTable.settings })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, context.tenantId))
        .limit(1);
      const [table] = order.tableId
        ? await tx
            .select({ code: diningTablesTable.code })
            .from(diningTablesTable)
            .where(
              and(
                eq(diningTablesTable.tenantId, context.tenantId),
                eq(diningTablesTable.id, order.tableId),
              ),
            )
            .limit(1)
        : [];
      const [operator] = context.userId
        ? await tx
            .select({ name: usersTable.name })
            .from(usersTable)
            .where(
              and(eq(usersTable.tenantId, context.tenantId), eq(usersTable.id, context.userId)),
            )
            .limit(1)
        : [];

      const { renderPaymentReceipt } = await import("../printing/print-renderer");
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
        .insert(printJobsTable)
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
      const {
        cashSessions: cashSessionsTable,
        printRoutes: printRoutesTable,
        printerDevices: printerDevicesTable,
        tenants: tenantsTable,
        users: usersTable,
        printJobs: printJobsTable,
        payments: paymentsTable,
        orders: ordersTable,
      } = await import("@giromesa/db");

      const [session] = await tx
        .select()
        .from(cashSessionsTable)
        .where(
          and(
            eq(cashSessionsTable.tenantId, context.tenantId),
            eq(cashSessionsTable.id, cashSessionId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new NotFoundException("Cash session not found");
      }

      const [route] = await tx
        .select({
          id: printRoutesTable.id,
          printerDeviceId: printRoutesTable.printerDeviceId,
          copies: printRoutesTable.copies,
          printerName: printerDevicesTable.name,
          charactersPerLine: printerDevicesTable.charactersPerLine,
          printerAddress: printerDevicesTable.address,
          printerPort: printerDevicesTable.port,
          printerConnectionType: printerDevicesTable.connectionType,
          printerConfig: printerDevicesTable.config,
        })
        .from(printRoutesTable)
        .innerJoin(
          printerDevicesTable,
          eq(printerDevicesTable.id, printRoutesTable.printerDeviceId),
        )
        .where(
          and(
            eq(printRoutesTable.tenantId, context.tenantId),
            eq(printRoutesTable.branchId, session.branchId),
            eq(printRoutesTable.targetType, "cash_summary"),
            eq(printRoutesTable.isActive, true),
            eq(printerDevicesTable.isActive, true),
          ),
        )
        .limit(1);

      if (!route) {
        throw new NotFoundException("No active cash summary print route for this branch");
      }

      const [tenant] = await tx
        .select({ name: tenantsTable.name, settings: tenantsTable.settings })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, context.tenantId))
        .limit(1);
      const [operator] = await tx
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(
          and(eq(usersTable.tenantId, context.tenantId), eq(usersTable.id, session.operatorId)),
        )
        .limit(1);
      const { sql } = await import("drizzle-orm");
      const paymentRows = await tx
        .select({
          method: paymentsTable.method,
          amountCents: sql<number>`coalesce(sum(${paymentsTable.amountCents}), 0)::int`,
        })
        .from(paymentsTable)
        .innerJoin(ordersTable, eq(ordersTable.id, paymentsTable.orderId))
        .where(
          and(
            eq(paymentsTable.tenantId, context.tenantId),
            eq(ordersTable.branchId, session.branchId),
            eq(paymentsTable.status, "confirmed"),
            sql`${paymentsTable.createdAt} >= ${session.openedAt}`,
          ),
        )
        .groupBy(paymentsTable.method);

      const { renderCashSummary } = await import("../printing/print-renderer");
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
        .insert(printJobsTable)
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
