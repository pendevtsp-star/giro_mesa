import {
  auditLogs,
  branchOperationalSettings,
  cashSessions,
  customers,
  diningTables,
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
} from "@giromesa/db";
import { activeOrderStatuses, type TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type OrderDbClient = DatabaseService["db"] | TransactionClient;

@Injectable()
export class OrderRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findOrderById(
    context: TenantContext,
    orderId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [order] = await client
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
      .limit(1);
    return order ?? null;
  }

  async findActiveOrder(
    context: TenantContext,
    input: { branchId: string; tableId?: string | undefined; orderId?: string | undefined },
    client: OrderDbClient = this.database.db,
  ) {
    const [order] = await client
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, input.branchId),
          inArray(orders.status, [...activeOrderStatuses]),
          input.tableId ? eq(orders.tableId, input.tableId) : undefined,
          input.orderId ? eq(orders.id, input.orderId) : undefined,
        ),
      )
      .orderBy(desc(orders.openedAt), desc(orders.createdAt))
      .limit(1);
    return order ?? null;
  }

  async findOrderItems(
    context: TenantContext,
    orderId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));
  }

  async findPaymentsByOrder(
    context: TenantContext,
    orderId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        method: payments.method,
        status: payments.status,
        registeredByUserId: payments.registeredByUserId,
        registeredVia: payments.registeredVia,
        cashHandoverStatus: payments.cashHandoverStatus,
        cashHandoverReceivedByUserId: payments.cashHandoverReceivedByUserId,
        cashHandoverReceivedAt: payments.cashHandoverReceivedAt,
        metadata: payments.metadata,
        confirmedAt: payments.confirmedAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.orderId, orderId)))
      .orderBy(desc(payments.confirmedAt), desc(payments.createdAt));
  }

  async updateOrder(
    context: TenantContext,
    orderId: string,
    data: Partial<typeof orders.$inferInsert>,
    expectedVersion?: number,
    client: OrderDbClient = this.database.db,
  ) {
    const [updated] = await client
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.id, orderId),
          ...(expectedVersion === undefined ? [] : [eq(orders.version, expectedVersion)]),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async insertOrder(
    context: TenantContext,
    data: Omit<typeof orders.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [order] = await client
      .insert(orders)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return order ?? null;
  }

  async insertOrderItem(
    context: TenantContext,
    data: Omit<typeof orderItems.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [item] = await client
      .insert(orderItems)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return item ?? null;
  }

  async insertPayment(
    context: TenantContext,
    data: Omit<typeof payments.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [payment] = await client
      .insert(payments)
      .values({ ...data, tenantId: context.tenantId })
      .onConflictDoNothing({
        target: [payments.tenantId, payments.idempotencyKey],
      })
      .returning();
    return payment ?? null;
  }

  async findPaymentByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [payment] = await client
      .select()
      .from(payments)
      .where(
        and(eq(payments.tenantId, context.tenantId), eq(payments.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    return payment ?? null;
  }

  async findModifierOptions(
    context: TenantContext,
    optionIds: string[],
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select()
      .from(modifierOptions)
      .where(
        and(
          eq(modifierOptions.tenantId, context.tenantId),
          inArray(modifierOptions.id, optionIds),
          eq(modifierOptions.isAvailable, true),
        ),
      );
  }

  async findModifierGroups(
    context: TenantContext,
    productId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select()
      .from(modifierGroups)
      .where(
        and(eq(modifierGroups.tenantId, context.tenantId), eq(modifierGroups.productId, productId)),
      );
  }

  async findProduct(
    context: TenantContext,
    productId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [product] = await client
      .select()
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.id, productId)))
      .limit(1);
    return product ?? null;
  }

  async findCustomer(
    context: TenantContext,
    customerId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [customer] = await client
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, customerId)))
      .limit(1);
    return customer ?? null;
  }

  async findDiningTable(
    context: TenantContext,
    tableId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [table] = await client
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .limit(1);
    return table ?? null;
  }

  async updateDiningTable(
    context: TenantContext,
    tableId: string,
    data: Partial<typeof diningTables.$inferInsert>,
    client: OrderDbClient = this.database.db,
  ) {
    const [updated] = await client
      .update(diningTables)
      .set({ ...data, version: sql`${diningTables.version} + 1`, updatedAt: new Date() })
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .returning();
    return updated ?? null;
  }

  async insertAuditLog(
    context: TenantContext,
    data: Omit<typeof auditLogs.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [log] = await client
      .insert(auditLogs)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return log ?? null;
  }

  async insertOutboxEvent(
    context: TenantContext,
    data: Omit<typeof outboxEvents.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [event] = await client
      .insert(outboxEvents)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return event ?? null;
  }

  async findKdsStations(
    context: TenantContext,
    branchId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select()
      .from(kdsStations)
      .where(
        and(
          eq(kdsStations.tenantId, context.tenantId),
          eq(kdsStations.branchId, branchId),
          eq(kdsStations.isActive, true),
        ),
      );
  }

  async updateOrderItemsStatus(
    context: TenantContext,
    orderId: string,
    status: typeof orderItems.$inferInsert.status,
    client: OrderDbClient = this.database.db,
  ) {
    await client
      .update(orderItems)
      .set({ status, sentToKitchenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.status, "pending"),
        ),
      );
  }

  async findPendingOrderItems(
    context: TenantContext,
    orderId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.status, "pending"),
        ),
      );
  }

  async findPendingOrderItemsForRouting(
    context: TenantContext,
    orderId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select({
        id: orderItems.id,
        name: orderItems.nameSnapshot,
        categoryId: products.categoryId,
      })
      .from(orderItems)
      .innerJoin(
        products,
        and(eq(products.tenantId, context.tenantId), eq(products.id, orderItems.productId)),
      )
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.status, "pending"),
        ),
      );
  }

  async insertKdsTickets(
    context: TenantContext,
    tickets: Array<Omit<typeof kdsTickets.$inferInsert, "tenantId">>,
    client: OrderDbClient = this.database.db,
  ) {
    if (tickets.length === 0) return [];
    return client
      .insert(kdsTickets)
      .values(tickets.map((t) => ({ ...t, tenantId: context.tenantId })))
      .returning();
  }

  async findActivePrintRoutes(
    context: TenantContext,
    branchId: string,
    client: OrderDbClient = this.database.db,
  ) {
    return client
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
          eq(printRoutes.branchId, branchId),
          eq(printRoutes.trigger, "kds_ticket_created"),
          eq(printRoutes.isActive, true),
          eq(printerDevices.isActive, true),
        ),
      );
  }

  async findRecipesByProductIds(
    context: TenantContext,
    productIds: string[],
    client: OrderDbClient = this.database.db,
  ) {
    if (productIds.length === 0) return [];
    return client
      .select()
      .from(recipes)
      .where(and(eq(recipes.tenantId, context.tenantId), inArray(recipes.productId, productIds)));
  }

  async findRecipeItems(
    context: TenantContext,
    recipeIds: string[],
    client: OrderDbClient = this.database.db,
  ) {
    if (recipeIds.length === 0) return [];
    return client
      .select()
      .from(recipeItems)
      .where(
        and(eq(recipeItems.tenantId, context.tenantId), inArray(recipeItems.recipeId, recipeIds)),
      );
  }

  async findStockLocation(
    context: TenantContext,
    branchId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [location] = await client
      .select()
      .from(stockLocations)
      .where(
        and(eq(stockLocations.tenantId, context.tenantId), eq(stockLocations.branchId, branchId)),
      )
      .limit(1);
    return location ?? null;
  }

  async insertStockMovement(
    context: TenantContext,
    data: Omit<typeof stockMovements.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [movement] = await client
      .insert(stockMovements)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return movement ?? null;
  }

  async findTenant(context: TenantContext, client: OrderDbClient = this.database.db) {
    const [tenant] = await client
      .select({ name: tenants.name, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);
    return tenant ?? null;
  }

  async findBranchOperationalSettings(
    context: TenantContext,
    branchId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [settings] = await client
      .select()
      .from(branchOperationalSettings)
      .where(
        and(
          eq(branchOperationalSettings.tenantId, context.tenantId),
          eq(branchOperationalSettings.branchId, branchId),
        ),
      )
      .limit(1);
    return settings ?? null;
  }

  async findOrderItemsForPrint(
    context: TenantContext,
    orderId: string,
    itemIds?: string[],
    client: OrderDbClient = this.database.db,
  ) {
    return client
      .select({
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          itemIds?.length ? inArray(orderItems.id, itemIds) : undefined,
          inArray(orderItems.status, ["pending", "sent", "preparing", "ready", "served"]),
        ),
      );
  }

  async findOrderItemsForKds(
    context: TenantContext,
    orderId: string,
    itemIds: string[],
    client: OrderDbClient = this.database.db,
  ) {
    if (itemIds.length === 0) return [];
    return client
      .select({
        id: orderItems.id,
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
        modifiers: orderItems.modifiers,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orderItems.orderId, orderId),
          inArray(orderItems.id, itemIds),
          inArray(orderItems.status, ["pending", "sent", "preparing", "ready", "served"]),
        ),
      );
  }

  async insertPrintJob(
    context: TenantContext,
    data: Omit<typeof printJobs.$inferInsert, "tenantId">,
    client: OrderDbClient = this.database.db,
  ) {
    const [job] = await client
      .insert(printJobs)
      .values({ ...data, tenantId: context.tenantId })
      .onConflictDoNothing()
      .returning();
    return job ?? null;
  }

  async findCashSession(
    context: TenantContext,
    branchId: string,
    client: OrderDbClient = this.database.db,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.branchId, branchId),
          eq(cashSessions.status, "open"),
        ),
      )
      .orderBy(desc(cashSessions.openedAt))
      .limit(1);
    return session ?? null;
  }

  async updateCashSession(
    context: TenantContext,
    sessionId: string,
    data: Partial<typeof cashSessions.$inferInsert>,
    client: OrderDbClient = this.database.db,
  ) {
    const [updated] = await client
      .update(cashSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, sessionId)))
      .returning();
    return updated ?? null;
  }
}
