import { createHash } from "node:crypto";
import {
  auditLogs,
  inventoryItems,
  operationalShifts,
  operationIdempotency,
  type orders,
  payments,
  products,
  qrGuestSessions,
  returnableMappings,
  staffServicePolicies,
  stockMovements,
  tableServiceSessions,
  tableWaiterAssignments,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { calculateOrderTotal, resolveProductionRouting, stateMachines } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { enqueueClubWhiskyStockUpdatedForInventoryItems } from "../integrations/club-whisky-events";
import { createPrintProvider } from "../printing/print-provider";
import { OrderRepository } from "./order.repository";
import { PosRepository } from "./pos.repository";
import { WaiterAssignmentService } from "./waiter-assignment.service";

type OpenOrderInput = {
  channel: "counter" | "table" | "tab" | "delivery" | "qr";
  branchId: string;
  tableId?: string | undefined;
  customerId?: string | undefined;
  peopleCount?: number | undefined;
  idempotencyKey: string;
};

type OpenOrderResult = typeof orders.$inferSelect & { audit: "order.opened" };

type AddItemInput = {
  productId: string;
  quantity: number;
  notes?: string | undefined;
  modifiers?: Record<string, unknown>[] | undefined;
  idempotencyKey: string;
};

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type PlannedStockMovement = Omit<typeof stockMovements.$inferInsert, "tenantId">;

export function planOrderInventoryMovements(input: {
  order: { id: string; branchId: string };
  items: Array<{ id: string; productId: string; quantity: string }>;
  recipes: Array<{ id: string; productId: string }>;
  ingredients: Array<{ recipeId: string; inventoryItemId: string; quantity: string }>;
  returnables: Array<{
    productId: string;
    fullInventoryItemId: string;
    emptyInventoryItemId: string;
  }>;
  location: { id: string; name: string };
}): PlannedStockMovement[] {
  const returnableByProduct = new Map(
    input.returnables.map((mapping) => [mapping.productId, mapping]),
  );
  const movements: PlannedStockMovement[] = [];

  for (const item of input.items) {
    const recipe = input.recipes.find((entry) => entry.productId === item.productId);
    const itemQuantity = Number(item.quantity);
    const recipeIngredients = recipe
      ? input.ingredients.filter((entry) => entry.recipeId === recipe.id)
      : [];
    for (const ingredient of recipeIngredients) {
      movements.push({
        branchId: input.order.branchId,
        inventoryItemId: ingredient.inventoryItemId,
        stockLocationId: input.location.id,
        type: "sale",
        quantity: String(-Number(ingredient.quantity) * itemQuantity),
        sourceType: "order_item",
        sourceId: item.id,
        reason: `Baixa automática do item ${item.id} do pedido ${input.order.id} em ${input.location.name}`,
      });
    }

    const returnable = returnableByProduct.get(item.productId);
    if (!returnable) continue;
    if (
      !recipeIngredients.some(
        (ingredient) => ingredient.inventoryItemId === returnable.fullInventoryItemId,
      )
    ) {
      movements.push({
        branchId: input.order.branchId,
        inventoryItemId: returnable.fullInventoryItemId,
        stockLocationId: input.location.id,
        type: "returnable_consumption",
        quantity: String(-itemQuantity),
        sourceType: "order_item",
        sourceId: item.id,
        reason: `Retornável cheio consumido pelo item ${item.id} do pedido ${input.order.id} em ${input.location.name}`,
      });
    }
    movements.push({
      branchId: input.order.branchId,
      inventoryItemId: returnable.emptyInventoryItemId,
      stockLocationId: input.location.id,
      type: "returnable_consumption",
      quantity: String(itemQuantity),
      sourceType: "order_item",
      sourceId: item.id,
      reason: `Retornável vazio gerado pelo item ${item.id} do pedido ${input.order.id} em ${input.location.name}`,
    });
  }

  return movements;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PosRepository) readonly _posRepository: PosRepository,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
    @Inject(FiscalService) private readonly fiscalService: FiscalService,
    @Optional()
    @Inject(WaiterAssignmentService)
    private readonly waiterAssignments?: WaiterAssignmentService,
  ) {}

  async openOrder(context: TenantContext, input: OpenOrderInput): Promise<OpenOrderResult> {
    await this._posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            branchId: input.branchId,
            channel: input.channel,
            customerId: input.customerId ?? null,
            peopleCount: input.peopleCount ?? 1,
            tableId: input.tableId ?? null,
          }),
        )
        .digest("hex");
      const [reservation] = await tx
        .insert(operationIdempotency)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          scope: "pos.open_order",
          idempotencyKey: input.idempotencyKey,
          requestHash,
        })
        .onConflictDoNothing()
        .returning({ id: operationIdempotency.id });
      if (!reservation) {
        const [existing] = await tx
          .select()
          .from(operationIdempotency)
          .where(
            and(
              eq(operationIdempotency.tenantId, context.tenantId),
              eq(operationIdempotency.branchId, input.branchId),
              eq(operationIdempotency.scope, "pos.open_order"),
              eq(operationIdempotency.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (!existing || existing.requestHash !== requestHash) {
          throw new ConflictException(
            "A chave de idempotência já foi usada para outra abertura de comanda",
          );
        }
        if (existing.status !== "completed" || !existing.response) {
          throw new ConflictException("A abertura desta comanda ainda está sendo processada");
        }
        return existing.response as OpenOrderResult;
      }

      if (input.tableId) {
        const table = await this.orderRepository.findDiningTable(context, input.tableId, tx);

        if (!table) {
          throw new NotFoundException("Table not found");
        }
        if (table.branchId !== input.branchId) {
          throw new BadRequestException("Table does not belong to the selected branch");
        }
        await this.waiterAssignments?.assertOrderAccess(
          context,
          { branchId: input.branchId, tableId: table.id },
          tx,
        );

        await this.orderRepository.updateDiningTable(
          context,
          table.id,
          {
            status: "occupied",
          },
          tx,
        );
        const activeOrder = await this.orderRepository.findActiveOrder(
          context,
          { branchId: input.branchId, tableId: table.id },
          tx,
        );
        if (activeOrder) throw new ConflictException("Table already has an active order");
      }

      if (input.customerId) {
        const customer = await this.orderRepository.findCustomer(context, input.customerId, tx);
        if (!customer) throw new NotFoundException("Customer not found");
      }

      const [shift] = await tx
        .select({ id: operationalShifts.id })
        .from(operationalShifts)
        .where(
          and(
            eq(operationalShifts.tenantId, context.tenantId),
            eq(operationalShifts.branchId, input.branchId),
            eq(operationalShifts.status, "open"),
          ),
        )
        .limit(1);
      const [servicePolicy] = await tx
        .select()
        .from(staffServicePolicies)
        .where(
          and(
            eq(staffServicePolicies.tenantId, context.tenantId),
            eq(staffServicePolicies.branchId, input.branchId),
            eq(staffServicePolicies.isActive, true),
          ),
        )
        .limit(1);

      const order = await this.orderRepository.insertOrder(
        context,
        {
          branchId: input.branchId,
          tableId: input.tableId,
          ...(input.customerId ? { customerId: input.customerId } : {}),
          channel: input.channel,
          status: "opened",
          peopleCount: input.peopleCount ?? 1,
          shiftId: shift?.id ?? null,
          serviceChargeStatus: servicePolicy ? "suggested" : "not_configured",
          serviceChargePolicySnapshot: servicePolicy
            ? {
                policyId: servicePolicy.id,
                version: servicePolicy.version,
                attributionMode: servicePolicy.attributionMode,
                serviceRateBps: servicePolicy.serviceRateBps,
                serviceBase: servicePolicy.serviceBase,
                poolRules: servicePolicy.poolRules,
              }
            : {},
          openedAt: new Date(),
        },
        tx,
      );

      if (!order) {
        throw new Error("Failed to open order");
      }
      await this.waiterAssignments?.assertOrderAccess(context, order, tx);

      await this.orderRepository.insertAuditLog(
        context,
        {
          branchId: input.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "order.opened",
          entityType: "order",
          entityId: order.id,
          metadata: { channel: order.channel, tableId: order.tableId },
        },
        tx,
      );

      const result = {
        ...order,
        audit: "order.opened" as const,
      };
      await tx
        .update(operationIdempotency)
        .set({
          status: "completed",
          response: JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(operationIdempotency.id, reservation.id));
      return result;
    });
  }

  async getActiveOrder(
    context: TenantContext,
    input: { branchId: string; tableId?: string | undefined; orderId?: string | undefined },
  ) {
    await this._posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    if (Boolean(input.tableId) === Boolean(input.orderId)) {
      throw new BadRequestException("Provide exactly one of tableId or orderId");
    }
    const order = await this.orderRepository.findActiveOrder(context, input);
    if (!order) return null;
    const [items, payments, doseClubConsumption] = await Promise.all([
      this.orderRepository.findOrderItems(context, order.id),
      this.orderRepository.findPaymentsByOrder(context, order.id),
      this.findDoseClubConsumption(context, order.id, order.branchId),
    ]);
    return { ...order, items, payments, doseClubConsumption };
  }

  private async findDoseClubConsumption(context: TenantContext, orderId: string, branchId: string) {
    const rows = await this.database.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityId: auditLogs.entityId,
        productName: products.name,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(
        products,
        and(eq(products.tenantId, auditLogs.tenantId), eq(products.id, auditLogs.entityId)),
      )
      .where(
        and(
          eq(auditLogs.tenantId, context.tenantId),
          eq(auditLogs.branchId, branchId),
          eq(auditLogs.entityType, "product"),
          inArray(auditLogs.action, [
            "club_whisky.dose_consumed",
            "club_whisky.dose_consumption_reversed",
          ]),
          sql`${auditLogs.metadata}->>'orderId' = ${orderId}`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt));

    const reversedConsumptionIds = new Set(
      rows
        .filter((row) => row.action === "club_whisky.dose_consumption_reversed")
        .map((row) => readMetadataString(row.metadata, "externalConsumptionId"))
        .filter((value): value is string => Boolean(value)),
    );

    return rows
      .filter((row) => row.action === "club_whisky.dose_consumed")
      .map((row) => {
        const consumptionId = readMetadataString(row.metadata, "externalConsumptionId") ?? row.id;
        return {
          id: row.id,
          productId: row.entityId,
          productName: row.productName ?? "Destilado do DoseClub",
          doseMl: readMetadataNumber(row.metadata, "doseMl") ?? 0,
          status: reversedConsumptionIds.has(consumptionId)
            ? ("reversed" as const)
            : ("consumed" as const),
          occurredAt: row.createdAt.toISOString(),
          remainingMl: readMetadataNumber(row.metadata, "remainingMl"),
        };
      });
  }

  async getProductionRoutingPreview(context: TenantContext, orderId: string) {
    const order = await this.orderRepository.findOrderById(context, orderId);
    if (!order) throw new NotFoundException("Order not found");
    return this.buildProductionRoutingPreview(context, order.id, order.branchId);
  }

  async addItem(context: TenantContext, orderId: string, input: AddItemInput) {
    return this.database.db.transaction(async (tx) => {
      const replay = await this.orderRepository.findOrderItemByIdempotencyKey(
        context,
        input.idempotencyKey,
        tx,
      );
      if (replay) {
        const replayModifierIds = readModifierOptionIds(replay.modifiers);
        const requestedModifierIds = readModifierOptionIds(input.modifiers ?? []);
        if (
          replay.orderId !== orderId ||
          replay.productId !== input.productId ||
          Number(replay.quantity) !== input.quantity ||
          (replay.notes ?? undefined) !== input.notes ||
          replayModifierIds.join("|") !== requestedModifierIds.join("|")
        ) {
          throw new ConflictException(
            "Idempotency key was already used with a different order item",
          );
        }
        return { ...replay, audit: "order.item_added", replayed: true };
      }
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }
      await this.waiterAssignments?.assertOrderAccess(context, order, tx);

      const product = await this.orderRepository.findProduct(context, input.productId, tx);

      if (!product?.isAvailable) {
        throw new NotFoundException("Product not found or unavailable");
      }

      const selectedOptionIds = (input.modifiers ?? [])
        .map((modifier) => (typeof modifier.optionId === "string" ? modifier.optionId : null))
        .filter((optionId): optionId is string => Boolean(optionId));

      const selectedOptions = selectedOptionIds.length
        ? await this.orderRepository.findModifierOptions(context, selectedOptionIds, tx)
        : [];

      if (selectedOptions.length !== selectedOptionIds.length)
        throw new BadRequestException("One or more modifiers are unavailable");

      const groups = selectedOptions.length
        ? await this.orderRepository.findModifierGroups(context, product.id, tx)
        : [];

      const selectedByGroup = new Map<string, number>();
      for (const option of selectedOptions)
        selectedByGroup.set(option.groupId, (selectedByGroup.get(option.groupId) ?? 0) + 1);

      for (const group of groups) {
        const selected = selectedByGroup.get(group.id) ?? 0;
        if (
          (group.isRequired && selected < group.minChoices) ||
          selected < group.minChoices ||
          selected > group.maxChoices
        )
          throw new BadRequestException(`Invalid choices for modifier group ${group.name}`);
      }

      const modifierDeltaCents = selectedOptions.reduce(
        (sum, option) => sum + option.priceDeltaCents,
        0,
      );

      const total = calculateOrderTotal({
        lines: [
          { quantity: input.quantity, unitPriceCents: product.priceCents + modifierDeltaCents },
        ],
      });

      const [assignment] =
        order.tableId && order.shiftId
          ? await tx
              .select({ waiterUserId: tableWaiterAssignments.waiterUserId })
              .from(tableWaiterAssignments)
              .where(
                and(
                  eq(tableWaiterAssignments.tenantId, context.tenantId),
                  eq(tableWaiterAssignments.tableId, order.tableId),
                  eq(tableWaiterAssignments.shiftId, order.shiftId),
                  sql`${tableWaiterAssignments.endedAt} is null`,
                ),
              )
              .limit(1)
          : [];

      const item = await this.orderRepository.insertOrderItem(
        context,
        {
          orderId,
          productId: product.id,
          nameSnapshot: product.name,
          quantity: String(input.quantity),
          unitPriceCents: product.priceCents + modifierDeltaCents,
          totalCents: total.totalCents,
          notes: input.notes,
          modifiers: selectedOptions.map((option) => ({
            optionId: option.id,
            groupId: option.groupId,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
          idempotencyKey: input.idempotencyKey,
          registeredByUserId: context.userId ?? null,
          shiftId: order.shiftId,
          responsibleWaiterUserId: assignment?.waiterUserId ?? null,
        },
        tx,
      );

      if (!item) {
        const replay = await this.orderRepository.findOrderItemByIdempotencyKey(
          context,
          input.idempotencyKey,
          tx,
        );
        if (replay) return { ...replay, audit: "order.item_added", replayed: true };
        throw new Error("Failed to add order item");
      }

      const nextSubtotal = order.subtotalCents + total.totalCents;
      const frozenPolicy = order.serviceChargePolicySnapshot as {
        serviceRateBps?: number;
        serviceBase?: "net_consumption" | "gross_consumption" | "manual";
      };
      const suggestedBase =
        frozenPolicy.serviceBase === "gross_consumption"
          ? nextSubtotal
          : Math.max(0, nextSubtotal - order.discountCents);
      const serviceChargeSuggestedCents =
        frozenPolicy.serviceBase === "manual"
          ? order.serviceChargeSuggestedCents
          : Math.floor(
              (suggestedBase * Math.max(0, frozenPolicy.serviceRateBps ?? 0) + 5_000) / 10_000,
            );
      const updatedOrder = await this.orderRepository.updateOrder(
        context,
        order.id,
        {
          subtotalCents: nextSubtotal,
          serviceChargeSuggestedCents,
          totalCents:
            nextSubtotal - order.discountCents + order.serviceChargeCents + order.deliveryFeeCents,
          version: order.version + 1,
        },
        order.version,
        tx,
      );
      if (!updatedOrder) {
        throw new ConflictException("Order was updated concurrently");
      }

      await this.orderRepository.insertAuditLog(
        context,
        {
          branchId: order.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "order.item_added",
          entityType: "order_item",
          entityId: item.id,
          metadata: {
            orderId: order.id,
            productId: product.id,
            quantity: input.quantity,
            idempotencyKey: input.idempotencyKey,
          },
        },
        tx,
      );
      await this.orderRepository.insertOutboxEvent(
        context,
        {
          topic: "order.item_added",
          payload: {
            orderId: order.id,
            orderItemId: item.id,
            branchId: order.branchId,
            productId: product.id,
            quantity: input.quantity,
            idempotencyKey: input.idempotencyKey,
          },
        },
        tx,
      );

      return {
        ...item,
        audit: "order.item_added",
      };
    });
  }

  async autoSendQrOrder(context: TenantContext, orderId: string) {
    return this.sendToKitchen(context, orderId, { systemQrDispatch: true });
  }

  async sendToKitchen(
    context: TenantContext,
    orderId: string,
    options: { systemQrDispatch?: boolean } = {},
  ) {
    return this.database.db.transaction(async (tx) => {
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }
      if (options.systemQrDispatch) {
        if (order.channel !== "qr") {
          throw new ForbiddenException("System dispatch is only available for QR orders");
        }
      } else {
        await this.waiterAssignments?.assertOrderAccess(context, order, tx);
      }

      if (order.status === "opened") {
        stateMachines.assertOrderTransition(order.status, "sent_to_kitchen");
      } else if (!["sent_to_kitchen", "preparing", "ready", "served"].includes(order.status)) {
        throw new BadRequestException("Order cannot receive a new production batch");
      }

      const pendingItems = await this.orderRepository.findPendingOrderItemsForRouting(
        context,
        orderId,
        tx,
      );

      if (pendingItems.length === 0) {
        if (["sent_to_kitchen", "preparing", "ready", "served"].includes(order.status)) {
          return {
            orderId,
            status: order.status,
            ticketsCreated: [],
            printJobsCreated: [],
            routing: { destinations: [], unroutedItems: [] },
            audit: "order.sent_to_kitchen",
            replayed: true,
          };
        }
        throw new BadRequestException("Order has no pending items to send");
      }

      const kdsItems = await this.orderRepository.findOrderItemsForKds(
        context,
        orderId,
        pendingItems.map((item) => item.id),
        tx,
      );
      const kdsItemById = new Map(kdsItems.map((item) => [item.id, item]));

      const preview = await this.buildProductionRoutingPreview(
        context,
        order.id,
        order.branchId,
        tx,
      );
      if (preview.unroutedItems.length > 0) {
        throw new BadRequestException({
          error: "production_items_unrouted",
          itemIds: preview.unroutedItems.map((item) => item.id),
        });
      }

      await this.orderRepository.updateOrderItemsStatus(context, orderId, "sent", tx);

      const tickets =
        preview.destinations.length > 0
          ? await this.orderRepository.insertKdsTickets(
              context,
              preview.destinations.map((destination) => ({
                branchId: order.branchId,
                stationId: destination.stationId,
                orderId,
                status: "sent" as const,
                payload: {
                  source: order.channel,
                  tableId: order.tableId,
                  itemIds: destination.itemIds,
                  items: destination.itemIds
                    .map((itemId) => kdsItemById.get(itemId))
                    .filter((item): item is (typeof kdsItems)[number] => Boolean(item))
                    .map(({ id, name, quantity, notes, modifiers }) => ({
                      id,
                      name,
                      quantity,
                      notes,
                      modifiers,
                      status: "sent" as const,
                    })),
                  outputMode: destination.outputMode,
                },
              })),
              tx,
            )
          : [];

      const printJobsCreated =
        tickets.length > 0
          ? await this.createKitchenPrintJobs(
              context,
              {
                order,
                tickets,
                stationIds: preview.destinations.map((destination) => destination.stationId),
              },
              tx,
            )
          : [];

      const updatedOrder = await this.orderRepository.updateOrder(
        context,
        order.id,
        {
          status: order.status === "opened" ? "sent_to_kitchen" : order.status,
          version: order.version + 1,
        },
        order.version,
        tx,
      );
      if (!updatedOrder) {
        throw new ConflictException("Order was updated concurrently");
      }

      if (order.tableId) {
        await this.orderRepository.updateDiningTable(
          context,
          order.tableId,
          {
            status: "order_sent",
          },
          tx,
        );
      }

      await this.orderRepository.insertAuditLog(
        context,
        {
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
        },
        tx,
      );

      return {
        orderId,
        status: updatedOrder.status,
        ticketsCreated: tickets,
        printJobsCreated,
        routing: preview,
        audit: "order.sent_to_kitchen",
      };
    });
  }

  private async buildProductionRoutingPreview(
    context: TenantContext,
    orderId: string,
    branchId: string,
    client?: TransactionClient,
  ) {
    const [items, stations, routes] = await Promise.all([
      this.orderRepository.findPendingOrderItemsForRouting(context, orderId, client),
      this.orderRepository.findKdsStations(context, branchId, client),
      this.orderRepository.findActivePrintRoutes(context, branchId, client),
    ]);
    return resolveProductionRouting({
      orderId,
      items,
      stations: stations.map((station) => ({
        id: station.id,
        name: station.name,
        outputMode: station.outputMode,
        productCategoryIds: station.productCategoryIds,
      })),
      printRoutes: routes.map((route) => ({
        id: route.id,
        stationId: route.stationId,
        printerDeviceId: route.printerDeviceId,
        printerName: route.printerName,
      })),
    });
  }

  private async createKitchenPrintJobs(
    context: TenantContext,
    input: {
      order: { id: string; branchId: string; channel: string; tableId: string | null };
      tickets: Array<{
        id: string;
        stationId: string | null;
        payload: Record<string, unknown>;
      }>;
      stationIds: string[];
    },
    client: TransactionClient,
  ) {
    const routes = await this.orderRepository.findActivePrintRoutes(
      context,
      input.order.branchId,
      client,
    );

    const activeRoutes = routes.filter(
      (route) => !route.stationId || input.stationIds.includes(route.stationId),
    );

    if (activeRoutes.length === 0) {
      return [];
    }

    const table = input.order.tableId
      ? await this.orderRepository.findDiningTable(context, input.order.tableId, client)
      : null;

    const printProvider = createPrintProvider();
    const createdJobs: Array<{ id: string }> = [];

    const tenant = await this.orderRepository.findTenant(context, client);
    const tenantName = readTenantDisplayName(tenant?.settings, tenant?.name ?? "GiroMesa");

    for (const ticket of input.tickets) {
      const itemIds = Array.isArray(ticket.payload.itemIds)
        ? ticket.payload.itemIds.filter((itemId): itemId is string => typeof itemId === "string")
        : [];
      const items = await this.orderRepository.findOrderItemsForPrint(
        context,
        input.order.id,
        itemIds,
        client,
      );
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

        const job = await this.orderRepository.insertPrintJob(
          context,
          {
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
          },
          client,
        );

        if (job) {
          createdJobs.push(job);
        }
      }
    }

    return createdJobs;
  }

  async assignCustomer(context: TenantContext, orderId: string, customerId: string) {
    return this.database.db.transaction(async (tx) => {
      const customer = await this.orderRepository.findCustomer(context, customerId, tx);
      if (!customer) throw new NotFoundException("Customer not found");
      const current = await this.orderRepository.findOrderById(context, orderId, tx);
      if (!current) throw new NotFoundException("Order not found");
      await this.waiterAssignments?.assertOrderAccess(context, current, tx);
      const order = await this.orderRepository.updateOrder(
        context,
        orderId,
        { customerId },
        undefined,
        tx,
      );
      if (!order) throw new NotFoundException("Order not found");
      await this.orderRepository.insertAuditLog(
        context,
        {
          branchId: order.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "order.customer_assigned",
          entityType: "order",
          entityId: order.id,
          metadata: { customerId },
        },
        tx,
      );
      return { ...order, audit: "order.customer_assigned" };
    });
  }

  async closeOrder(context: TenantContext, orderId: string) {
    const closedOrder = await this.database.db.transaction(async (tx) => {
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }
      await this.waiterAssignments?.assertOrderAccess(context, order, tx);

      if (order.closedAt) {
        return {
          orderId,
          status: "paid",
          fiscalStatus: "pending",
          audit: "order.closed",
          replayed: true,
        };
      }

      if (order.status !== "paid") {
        throw new BadRequestException("Order must be paid before close");
      }

      const closedAt = new Date();
      const claimedOrder = await this.orderRepository.updateOrder(
        context,
        order.id,
        {
          status: "paid",
          closedAt,
          version: order.version + 1,
        },
        order.version,
        tx,
      );
      if (!claimedOrder) {
        throw new ConflictException("Order was closed or updated concurrently");
      }

      const items = await this.orderRepository.findOrderItems(context, orderId, tx);
      const activeItems = items.filter((item) =>
        ["pending", "sent", "preparing", "ready", "served"].includes(item.status),
      );
      const productIds = [...new Set(activeItems.map((item) => item.productId))];

      const productRecipes = await this.orderRepository.findRecipesByProductIds(
        context,
        productIds,
        tx,
      );
      const recipeIds = productRecipes.map((recipe) => recipe.id);
      const ingredients = await this.orderRepository.findRecipeItems(context, recipeIds, tx);
      const returnables = productIds.length
        ? await tx
            .select()
            .from(returnableMappings)
            .where(
              and(
                eq(returnableMappings.tenantId, context.tenantId),
                inArray(returnableMappings.productId, productIds),
              ),
            )
        : [];
      const defaultLocation = await this.orderRepository.findStockLocation(
        context,
        order.branchId,
        tx,
      );
      let stockMovementsCreated = 0;
      const changedInventoryItemIds = new Set<string>();
      const plannedMovements = defaultLocation
        ? planOrderInventoryMovements({
            order,
            items: activeItems,
            recipes: productRecipes,
            ingredients,
            returnables,
            location: defaultLocation,
          })
        : [];

      const deductions = new Map<string, number>();
      for (const movement of plannedMovements) {
        const quantity = Number(movement.quantity);
        if (quantity < 0) {
          deductions.set(
            movement.inventoryItemId,
            (deductions.get(movement.inventoryItemId) ?? 0) + Math.abs(quantity),
          );
        }
      }
      for (const [inventoryItemId, quantity] of [...deductions.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        if (!defaultLocation) break;
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${context.tenantId}:${order.branchId}:${inventoryItemId}:${defaultLocation.id}`}))`,
        );
        const [itemPolicy] = await tx
          .select({ allowNegative: inventoryItems.allowNegative })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.tenantId, context.tenantId),
              eq(inventoryItems.id, inventoryItemId),
            ),
          )
          .limit(1);
        if (!itemPolicy) throw new NotFoundException("Inventory item not found");
        if (!itemPolicy.allowNegative) {
          const [balance] = await tx
            .select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
            .from(stockMovements)
            .where(
              and(
                eq(stockMovements.tenantId, context.tenantId),
                eq(stockMovements.branchId, order.branchId),
                eq(stockMovements.inventoryItemId, inventoryItemId),
                eq(stockMovements.stockLocationId, defaultLocation.id),
              ),
            );
          if (Number(balance?.quantity ?? 0) < quantity) {
            throw new ConflictException(`Insufficient stock at ${defaultLocation.name}`);
          }
        }
      }
      for (const movement of plannedMovements) {
        await this.orderRepository.insertStockMovement(context, movement, tx);
        stockMovementsCreated += 1;
        changedInventoryItemIds.add(movement.inventoryItemId);
      }

      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: order.branchId,
        inventoryItemIds: [...changedInventoryItemIds],
        movementType: "sale",
        movementId: order.id,
      });

      const tableStatusAfterClose = order.tableId
        ? (await this.orderRepository.findBranchOperationalSettings(context, order.branchId, tx))
            ?.cleaningMode === "automatic"
          ? "free"
          : "cleaning"
        : null;
      if (order.tableId && tableStatusAfterClose) {
        await this.orderRepository.updateDiningTable(
          context,
          order.tableId,
          { status: tableStatusAfterClose },
          tx,
        );
      }
      if (order.tableId) {
        const closedSessions = await tx
          .update(tableServiceSessions)
          .set({
            status: "closed",
            closedByUserId: context.userId ?? null,
            closedAt,
            updatedAt: closedAt,
          })
          .where(
            and(
              eq(tableServiceSessions.tenantId, context.tenantId),
              eq(tableServiceSessions.tableId, order.tableId),
              eq(tableServiceSessions.status, "active"),
            ),
          )
          .returning({ id: tableServiceSessions.id });
        if (closedSessions.length) {
          await tx
            .update(qrGuestSessions)
            .set({
              status: "revoked",
              revokedAt: closedAt,
              revokedByUserId: context.userId ?? null,
              updatedAt: closedAt,
            })
            .where(
              inArray(
                qrGuestSessions.tableServiceSessionId,
                closedSessions.map((session) => session.id),
              ),
            );
        }
      }

      await this.orderRepository.insertAuditLog(
        context,
        {
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
            inventorySkipped: !defaultLocation,
            tableStatusAfterClose,
          },
        },
        tx,
      );

      await this.orderRepository.insertOutboxEvent(
        context,
        {
          topic: "order.closed",
          payload: {
            orderId: order.id,
            branchId: order.branchId,
            tableId: order.tableId,
            channel: order.channel,
            totalCents: order.totalCents,
            closedAt: closedAt.toISOString(),
          },
        },
        tx,
      );

      let fiscalDocument: { id: string; status: string } | undefined;
      let fiscalError: string | undefined;
      try {
        fiscalDocument = await this.fiscalService.createPendingOrderDocumentInTransaction(
          context,
          orderId,
          undefined,
          tx,
        );
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        fiscalError = error instanceof Error ? error.message : "Fiscal pending creation failed";
      }

      return {
        orderId,
        status: "paid",
        fiscalStatus: fiscalDocument?.status ?? "not_queued",
        ...(fiscalDocument ? { fiscalDocumentId: fiscalDocument.id } : {}),
        ...(fiscalError ? { fiscalError } : {}),
        audit: "order.closed",
        replayed: false,
      };
    });

    if (closedOrder.replayed) {
      const { replayed, ...response } = closedOrder;
      return response;
    }

    const { replayed, ...response } = closedOrder;
    return response;
  }

  async writeOffOrder(
    context: TenantContext,
    orderId: string,
    input: { expectedVersion: number; reason: string },
  ) {
    return this.database.db.transaction((tx) =>
      this.writeOffOrderInTransaction(context, orderId, input, tx),
    );
  }

  async writeOffOrderInTransaction(
    context: TenantContext,
    orderId: string,
    input: { expectedVersion: number; reason: string },
    tx: TransactionClient,
  ) {
    const order = await this.orderRepository.findOrderById(context, orderId, tx);
    if (!order) throw new NotFoundException("Order not found");
    if (context.branchId && order.branchId !== context.branchId)
      throw new ForbiddenException("Branch is not authorized");
    if (order.version !== input.expectedVersion)
      throw new ConflictException("Order was updated concurrently");
    if (order.closedAt || ["paid", "canceled", "refunded", "written_off"].includes(order.status))
      throw new BadRequestException("Only an open unpaid order can be written off");
    const [paid] = await tx
      .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.orderId, order.id),
          eq(payments.status, "confirmed"),
        ),
      );
    if (Number(paid?.total ?? 0) > 0)
      throw new BadRequestException("A paid order cannot be written off");
    const closedAt = new Date();
    const updated = await this.orderRepository.updateOrder(
      context,
      order.id,
      { status: "written_off", closedAt, version: order.version + 1 },
      order.version,
      tx,
    );
    if (!updated) throw new ConflictException("Order was updated concurrently");
    if (order.tableId) {
      await this.orderRepository.updateDiningTable(context, order.tableId, { status: "free" }, tx);
      const closedSessions = await tx
        .update(tableServiceSessions)
        .set({
          status: "closed",
          closedByUserId: context.userId ?? null,
          closedAt,
          updatedAt: closedAt,
        })
        .where(
          and(
            eq(tableServiceSessions.tenantId, context.tenantId),
            eq(tableServiceSessions.tableId, order.tableId),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .returning({ id: tableServiceSessions.id });
      if (closedSessions.length) {
        await tx
          .update(qrGuestSessions)
          .set({
            status: "revoked",
            revokedAt: closedAt,
            revokedByUserId: context.userId ?? null,
            updatedAt: closedAt,
          })
          .where(
            inArray(
              qrGuestSessions.tableServiceSessionId,
              closedSessions.map((session) => session.id),
            ),
          );
      }
    }
    await this.orderRepository.insertAuditLog(
      context,
      {
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "order.written_off",
        entityType: "order",
        entityId: order.id,
        metadata: { reason: input.reason, tableId: order.tableId },
      },
      tx,
    );
    await this.orderRepository.insertOutboxEvent(
      context,
      {
        topic: "order.written_off",
        payload: { orderId: order.id, branchId: order.branchId, reason: input.reason },
      },
      tx,
    );
    return updated;
  }
}

function readModifierOptionIds(modifiers: readonly Record<string, unknown>[] | undefined) {
  return [
    ...new Set(
      (modifiers ?? []).flatMap((modifier) =>
        typeof modifier.optionId === "string" ? [modifier.optionId] : [],
      ),
    ),
  ].sort();
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
