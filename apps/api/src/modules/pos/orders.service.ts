import type { TenantContext } from "@giromesa/domain";
import { calculateOrderTotal, resolveProductionRouting, stateMachines } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { enqueueClubWhiskyStockUpdatedForInventoryItems } from "../integrations/club-whisky-events";
import { createPrintProvider } from "../printing/print-provider";
import { OrderRepository } from "./order.repository";
import { PosRepository } from "./pos.repository";

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

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PosRepository) readonly _posRepository: PosRepository,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
    @Inject(FiscalService) private readonly fiscalService: FiscalService,
  ) {}

  async openOrder(context: TenantContext, input: OpenOrderInput) {
    await this._posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      if (input.tableId) {
        const table = await this.orderRepository.findDiningTable(context, input.tableId, tx);

        if (!table) {
          throw new NotFoundException("Table not found");
        }
        if (table.branchId !== input.branchId) {
          throw new BadRequestException("Table does not belong to the selected branch");
        }

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

      const order = await this.orderRepository.insertOrder(
        context,
        {
          branchId: input.branchId,
          tableId: input.tableId,
          ...(input.customerId ? { customerId: input.customerId } : {}),
          channel: input.channel,
          status: "opened",
          peopleCount: input.peopleCount ?? 1,
          openedAt: new Date(),
        },
        tx,
      );

      if (!order) {
        throw new Error("Failed to open order");
      }

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

      return {
        ...order,
        audit: "order.opened",
      };
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
    const [items, payments] = await Promise.all([
      this.orderRepository.findOrderItems(context, order.id),
      this.orderRepository.findPaymentsByOrder(context, order.id),
    ]);
    return { ...order, items, payments };
  }

  async getProductionRoutingPreview(context: TenantContext, orderId: string) {
    const order = await this.orderRepository.findOrderById(context, orderId);
    if (!order) throw new NotFoundException("Order not found");
    return this.buildProductionRoutingPreview(context, order.id, order.branchId);
  }

  async addItem(context: TenantContext, orderId: string, input: AddItemInput) {
    return this.database.db.transaction(async (tx) => {
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

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
        },
        tx,
      );

      const nextSubtotal = order.subtotalCents + total.totalCents;
      const updatedOrder = await this.orderRepository.updateOrder(
        context,
        order.id,
        {
          subtotalCents: nextSubtotal,
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

      return {
        ...item,
        audit: "order.item_added",
      };
    });
  }

  async sendToKitchen(context: TenantContext, orderId: string) {
    return this.database.db.transaction(async (tx) => {
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
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
    const customer = await this.orderRepository.findCustomer(context, customerId);
    if (!customer) throw new NotFoundException("Customer not found");

    const order = await this.orderRepository.updateOrder(context, orderId, {
      customerId,
    });

    if (!order) throw new NotFoundException("Order not found");

    await this.orderRepository.insertAuditLog(context, {
      branchId: order.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "order.customer_assigned",
      entityType: "order",
      entityId: order.id,
      metadata: { customerId },
    });

    return { ...order, audit: "order.customer_assigned" };
  }

  async closeOrder(context: TenantContext, orderId: string) {
    const closedOrder = await this.database.db.transaction(async (tx) => {
      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

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
      const defaultLocation = await this.orderRepository.findStockLocation(
        context,
        order.branchId,
        tx,
      );

      let stockMovementsCreated = 0;
      const changedInventoryItemIds = new Set<string>();
      for (const item of activeItems) {
        const recipe = productRecipes.find((entry) => entry.productId === item.productId);
        if (!recipe) {
          continue;
        }

        const itemQuantity = Number(item.quantity);
        for (const ingredient of ingredients.filter((entry) => entry.recipeId === recipe.id)) {
          await this.orderRepository.insertStockMovement(
            context,
            {
              branchId: order.branchId,
              inventoryItemId: ingredient.inventoryItemId,
              stockLocationId: defaultLocation?.id,
              type: "sale",
              quantity: String(-Number(ingredient.quantity) * itemQuantity),
              sourceType: "order_item",
              sourceId: item.id,
              reason: `Baixa automatica do item ${item.id} do pedido ${order.id}`,
            },
            tx,
          );
          stockMovementsCreated += 1;
          changedInventoryItemIds.add(ingredient.inventoryItemId);
        }
      }

      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: order.branchId,
        inventoryItemIds: [...changedInventoryItemIds],
        movementType: "sale",
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

      return {
        orderId,
        status: "paid",
        fiscalStatus: "pending",
        audit: "order.closed",
        replayed: false,
      };
    });

    if (closedOrder.replayed) {
      const { replayed, ...response } = closedOrder;
      return response;
    }

    try {
      const fiscalDocument = await this.fiscalService.createPendingOrderDocument(context, orderId);
      const { replayed, ...response } = closedOrder;
      return {
        ...response,
        fiscalDocumentId: fiscalDocument.id,
        fiscalStatus: fiscalDocument.status,
      };
    } catch (error) {
      const { replayed, ...response } = closedOrder;
      return {
        ...response,
        fiscalStatus: "error",
        fiscalError: error instanceof Error ? error.message : "Fiscal pending creation failed",
      };
    }
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
