import { createHash } from "node:crypto";
import {
  auditLogs,
  branches,
  branchInventorySettings,
  inventoryItems,
  inventoryTransferLines,
  inventoryTransfers,
  operationIdempotency,
  products,
  recipeItems,
  recipes,
  returnableMappings,
  stockLocations,
  stockMovements,
  suppliers,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { enqueueClubWhiskyStockUpdatedForInventoryItems } from "../integrations/club-whisky-events";

type InventoryDatabaseClient = Pick<
  DatabaseService["db"],
  "execute" | "insert" | "select" | "update"
>;

export type InventoryItemInput = {
  name: string;
  unit: string;
  averageCostCents?: number | undefined;
  minQuantity?: string | undefined;
  allowNegative?: boolean | undefined;
};

export type StockAdjustmentInput = {
  branchId: string;
  inventoryItemId: string;
  stockLocationId?: string | undefined;
  supplierId?: string | undefined;
  type: "purchase_receipt" | "loss" | "inventory_count" | "manual_adjustment";
  quantity: string;
  unitCostCents?: number | undefined;
  reason: string;
};

export type SupplierInput = {
  name: string;
  document?: string | undefined;
  contactName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
};

export type RecipeInput = {
  productId: string;
  yieldQuantity?: string | undefined;
  technicalLossRate?: string | undefined;
  items: {
    inventoryItemId: string;
    quantity: string;
    unit: string;
  }[];
};

export type TransferInput = {
  branchId: string;
  originLocationId: string;
  destinationLocationId: string;
  reason: string;
  idempotencyKey: string;
  submit?: boolean | undefined;
  lines: Array<{ inventoryItemId: string; quantity: string }>;
};

export type ReceiveTransferInput = {
  expectedVersion: number;
  lines: Array<{ id: string; quantityReceived: string; divergenceReason?: string | undefined }>;
};

export type ReturnableEventInput = {
  branchId: string;
  stockLocationId: string;
  mappingId: string;
  quantity: string;
  type: "supplier_exchange" | "breakage" | "loss";
  reason: string;
  idempotencyKey: string;
  supplierId?: string | undefined;
};

@Injectable()
export class InventoryService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listSummary(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);

    return this.database.db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        averageCostCents: inventoryItems.averageCostCents,
        minQuantity: inventoryItems.minQuantity,
        allowNegative: inventoryItems.allowNegative,
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
      .groupBy(inventoryItems.id)
      .orderBy(inventoryItems.name);
  }

  async listAlerts(context: TenantContext, branchId: string) {
    const summary = await this.listSummary(context, branchId);

    return summary
      .map((item) => {
        const quantity = Number(item.quantity);
        const minQuantity = Number(item.minQuantity);
        const shortage = Math.max(minQuantity - quantity, 0);
        return {
          ...item,
          quantity,
          minQuantity,
          shortage,
          status: quantity < 0 ? "negative" : quantity < minQuantity ? "below_minimum" : "ok",
        };
      })
      .filter((item) => item.status !== "ok")
      .sort((left, right) => right.shortage - left.shortage);
  }

  async listLocations(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    return this.database.db
      .select()
      .from(stockLocations)
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.branchId, branchId),
          isNull(stockLocations.archivedAt),
        ),
      )
      .orderBy(stockLocations.name);
  }

  async createLocation(
    context: TenantContext,
    input: { branchId: string; name: string; type: string },
  ) {
    await this.assertBranch(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      const [location] = await tx
        .insert(stockLocations)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          name: input.name,
          type: input.type,
        })
        .returning();
      if (!location) throw new Error("Failed to create stock location");
      await this.audit(
        context,
        {
          branchId: input.branchId,
          action: "inventory.location_created",
          entityType: "stock_location",
          entityId: location.id,
          metadata: { type: location.type },
        },
        tx,
      );
      return location;
    });
  }

  async renameLocation(context: TenantContext, locationId: string, name: string) {
    return this.database.db.transaction(async (tx) => {
      await this.lockLocations(tx, context, [locationId]);
      const location = await this.location(context, locationId, tx);
      const [updated] = await tx
        .update(stockLocations)
        .set({ name, updatedAt: new Date() })
        .where(
          and(eq(stockLocations.tenantId, context.tenantId), eq(stockLocations.id, location.id)),
        )
        .returning();
      await this.audit(
        context,
        {
          branchId: location.branchId,
          action: "inventory.location_renamed",
          entityType: "stock_location",
          entityId: location.id,
          metadata: { name },
        },
        tx,
      );
      return updated;
    });
  }

  async archiveLocation(context: TenantContext, locationId: string) {
    return this.database.db.transaction(async (tx) => {
      await this.lockLocations(tx, context, [locationId]);
      const location = await this.location(context, locationId, tx);
      if (location.type === "transit")
        throw new BadRequestException("Transit location cannot be archived");
      const [configured] = await tx
        .select({ branchId: branchInventorySettings.branchId })
        .from(branchInventorySettings)
        .where(
          and(
            eq(branchInventorySettings.tenantId, context.tenantId),
            eq(branchInventorySettings.branchId, location.branchId),
            eq(branchInventorySettings.consumptionLocationId, location.id),
          ),
        )
        .limit(1);
      if (configured) {
        throw new ConflictException("Change the branch consumption location before archiving");
      }
      const [balance] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.tenantId, context.tenantId),
            eq(stockMovements.stockLocationId, location.id),
          ),
        );
      if (Number(balance?.quantity ?? 0) !== 0) {
        throw new ConflictException("Location with stock cannot be archived");
      }
      const [openTransfer] = await tx
        .select({ id: inventoryTransfers.id })
        .from(inventoryTransfers)
        .where(
          and(
            eq(inventoryTransfers.tenantId, context.tenantId),
            inArray(inventoryTransfers.status, ["draft", "awaiting_receipt"]),
            sql`(${inventoryTransfers.originLocationId} = ${location.id} or ${inventoryTransfers.destinationLocationId} = ${location.id})`,
          ),
        )
        .limit(1);
      if (openTransfer)
        throw new ConflictException("Location with open transfer cannot be archived");
      const [updated] = await tx
        .update(stockLocations)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(stockLocations.tenantId, context.tenantId),
            eq(stockLocations.id, location.id),
            isNull(stockLocations.archivedAt),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("Location was archived concurrently");
      await this.audit(
        context,
        {
          branchId: location.branchId,
          action: "inventory.location_archived",
          entityType: "stock_location",
          entityId: location.id,
        },
        tx,
      );
      return updated;
    });
  }

  async listLocationBalances(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    return this.database.db
      .select({
        locationId: stockLocations.id,
        locationName: stockLocations.name,
        locationType: stockLocations.type,
        inventoryItemId: stockMovements.inventoryItemId,
        inventoryItemName: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockLocations)
      .leftJoin(
        stockMovements,
        and(
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.stockLocationId, stockLocations.id),
        ),
      )
      .leftJoin(inventoryItems, eq(inventoryItems.id, stockMovements.inventoryItemId))
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.branchId, branchId),
          isNull(stockLocations.archivedAt),
        ),
      )
      .groupBy(stockLocations.id, stockMovements.inventoryItemId, inventoryItems.id)
      .orderBy(stockLocations.name, inventoryItems.name);
  }

  async saveSettings(
    context: TenantContext,
    input: {
      branchId: string;
      transferMode: "immediate" | "awaiting_receipt";
      managerApprovalThreshold: string;
      consumptionLocationId: string;
    },
  ) {
    await this.assertBranch(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      const consumptionLocation = await this.location(
        context,
        input.consumptionLocationId,
        tx,
        input.branchId,
      );
      if (consumptionLocation.type === "transit") {
        throw new BadRequestException("Consumption location cannot be transit");
      }
      const [settings] = await tx
        .insert(branchInventorySettings)
        .values({ ...input, tenantId: context.tenantId })
        .onConflictDoUpdate({
          target: [branchInventorySettings.tenantId, branchInventorySettings.branchId],
          set: {
            transferMode: input.transferMode,
            managerApprovalThreshold: input.managerApprovalThreshold,
            consumptionLocationId: input.consumptionLocationId,
            updatedAt: new Date(),
          },
        })
        .returning();
      await this.audit(
        context,
        {
          branchId: input.branchId,
          action: "inventory.settings_updated",
          entityType: "branch_inventory_settings",
          ...(settings ? { entityId: settings.id } : {}),
          metadata: {
            transferMode: input.transferMode,
            managerApprovalThreshold: input.managerApprovalThreshold,
            consumptionLocationId: input.consumptionLocationId,
          },
        },
        tx,
      );
      return settings;
    });
  }

  async getSettings(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    return this.settings(context, branchId);
  }

  async listSuppliers(context: TenantContext) {
    return this.database.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, context.tenantId), eq(suppliers.isActive, true)))
      .orderBy(suppliers.name);
  }

  async createSupplier(context: TenantContext, input: SupplierInput) {
    const [supplier] = await this.database.db
      .insert(suppliers)
      .values({
        tenantId: context.tenantId,
        name: input.name,
        ...(input.document ? { document: input.document } : {}),
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email ? { email: input.email } : {}),
      })
      .returning();
    if (!supplier) throw new Error("Failed to create supplier");
    await this.audit(context, {
      action: "inventory.supplier_created",
      entityType: "supplier",
      entityId: supplier.id,
    });
    return supplier;
  }

  async listMovements(context: TenantContext, branchId: string, limit: number) {
    await this.assertBranch(context, branchId);
    return this.database.db
      .select({
        id: stockMovements.id,
        inventoryItemId: stockMovements.inventoryItemId,
        inventoryItemName: inventoryItems.name,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        unitCostCents: stockMovements.unitCostCents,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.inventoryItemId))
      .where(
        and(eq(stockMovements.tenantId, context.tenantId), eq(stockMovements.branchId, branchId)),
      )
      .orderBy(desc(stockMovements.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  async listTransfers(context: TenantContext, branchId: string, status?: string) {
    await this.assertBranch(context, branchId);
    const rows = await this.database.db
      .select()
      .from(inventoryTransfers)
      .where(
        and(
          eq(inventoryTransfers.tenantId, context.tenantId),
          eq(inventoryTransfers.branchId, branchId),
          ...(status ? [eq(inventoryTransfers.status, status)] : []),
        ),
      )
      .orderBy(desc(inventoryTransfers.createdAt))
      .limit(100);
    if (rows.length === 0) return [];
    const lines = await this.database.db
      .select()
      .from(inventoryTransferLines)
      .where(
        and(
          eq(inventoryTransferLines.tenantId, context.tenantId),
          inArray(
            inventoryTransferLines.transferId,
            rows.map((row) => row.id),
          ),
        ),
      );
    return rows.map((row) => ({
      ...row,
      lines: lines.filter((line) => line.transferId === row.id),
    }));
  }

  async listReturnableMappings(context: TenantContext) {
    return this.database.db
      .select()
      .from(returnableMappings)
      .where(eq(returnableMappings.tenantId, context.tenantId))
      .orderBy(desc(returnableMappings.updatedAt));
  }

  async createItem(context: TenantContext, input: InventoryItemInput) {
    const [item] = await this.database.db
      .insert(inventoryItems)
      .values({
        tenantId: context.tenantId,
        name: input.name,
        unit: input.unit,
        averageCostCents: input.averageCostCents ?? 0,
        minQuantity: input.minQuantity ?? "0",
        allowNegative: input.allowNegative ?? false,
      })
      .returning();

    if (!item) {
      throw new Error("Failed to create inventory item");
    }

    await this.audit(context, {
      action: "inventory.item_created",
      entityType: "inventory_item",
      entityId: item.id,
      metadata: { unit: item.unit },
    });

    return item;
  }

  async adjustStock(context: TenantContext, input: StockAdjustmentInput) {
    await this.assertBranch(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.tenantId, context.tenantId),
            eq(inventoryItems.id, input.inventoryItemId),
          ),
        )
        .limit(1);

      if (!item) {
        throw new NotFoundException("Inventory item not found");
      }

      if (input.supplierId) {
        const [supplier] = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(eq(suppliers.tenantId, context.tenantId), eq(suppliers.id, input.supplierId)))
          .limit(1);
        if (!supplier) throw new NotFoundException("Supplier not found");
      }
      const stockLocationId =
        input.stockLocationId ?? (await this.defaultLocationId(context, input.branchId, tx));
      if (!stockLocationId) throw new Error("Failed to resolve stock location");
      await this.location(context, stockLocationId, tx, input.branchId);
      await this.lockStock(tx, context, input.branchId, item.id, stockLocationId);
      const currentQuantity = await this.currentQuantity(
        context,
        input.branchId,
        item.id,
        tx,
        stockLocationId,
      );
      const quantity = this.normalizeMovementQuantity(input.type, input.quantity, currentQuantity);
      if (!item.allowNegative && currentQuantity + Number(quantity) < 0) {
        throw new ConflictException("Negative stock is not allowed for this item");
      }
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          inventoryItemId: item.id,
          stockLocationId,
          ...(input.supplierId ? { supplierId: input.supplierId } : {}),
          type: input.type,
          quantity,
          unitCostCents: input.unitCostCents ?? item.averageCostCents,
          sourceType: input.type === "purchase_receipt" ? "purchase" : "manual",
          reason: input.reason,
        })
        .returning();

      if (!movement) {
        throw new Error("Failed to create stock movement");
      }

      if (input.type === "purchase_receipt" && input.unitCostCents !== undefined) {
        await tx
          .update(inventoryItems)
          .set({ averageCostCents: input.unitCostCents, updatedAt: new Date() })
          .where(
            and(eq(inventoryItems.tenantId, context.tenantId), eq(inventoryItems.id, item.id)),
          );
      }

      await this.audit(
        context,
        {
          branchId: input.branchId,
          action: `inventory.${input.type}`,
          entityType: "stock_movement",
          entityId: movement.id,
          metadata: {
            inventoryItemId: item.id,
            quantity,
            type: input.type,
            supplierId: input.supplierId,
            reason: input.reason,
          },
        },
        tx,
      );

      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: input.branchId,
        inventoryItemIds: [item.id],
        movementType: input.type,
        movementId: movement.id,
      });

      return movement;
    });
  }

  async createTransfer(
    context: TenantContext,
    input: TransferInput,
  ): Promise<typeof inventoryTransfers.$inferSelect> {
    await this.assertBranch(context, input.branchId);
    if (input.originLocationId === input.destinationLocationId) {
      throw new BadRequestException("Origin and destination must differ");
    }
    if (
      input.lines.length === 0 ||
      new Set(input.lines.map((line) => line.inventoryItemId)).size !== input.lines.length
    ) {
      throw new BadRequestException("Transfer requires unique item lines");
    }

    return this.database.db.transaction(async (tx) => {
      await this.assertTransferLocations(
        context,
        input.branchId,
        input.originLocationId,
        input.destinationLocationId,
        tx,
      );
      await this.assertInventoryItems(
        context,
        input.lines.map((line) => line.inventoryItemId),
        tx,
      );
      const idempotency = await this.reserveIdempotency(tx, context, {
        branchId: input.branchId,
        scope: "inventory.transfer.create",
        key: input.idempotencyKey,
        payload: input,
      });
      if (idempotency.response) {
        return idempotency.response as unknown as typeof inventoryTransfers.$inferSelect;
      }
      const settings = await this.settings(context, input.branchId, tx);
      const [transfer] = await tx
        .insert(inventoryTransfers)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          originLocationId: input.originLocationId,
          destinationLocationId: input.destinationLocationId,
          requestedByUserId: context.userId,
          status: "draft",
          mode: settings.transferMode,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing()
        .returning();
      if (!transfer) {
        const existing = await this.transferByIdempotencyKey(context, input.idempotencyKey, tx);
        await this.assertTransferPayload(existing, input, tx);
        await this.completeIdempotency(tx, idempotency.id, existing);
        return existing;
      }
      await tx.insert(inventoryTransferLines).values(
        input.lines.map((line) => ({
          tenantId: context.tenantId,
          transferId: transfer.id,
          inventoryItemId: line.inventoryItemId,
          quantitySent: this.positiveQuantity(line.quantity),
        })),
      );
      if (input.submit === false) {
        await this.audit(
          context,
          {
            branchId: input.branchId,
            action: "inventory.transfer_drafted",
            entityType: "inventory_transfer",
            entityId: transfer.id,
          },
          tx,
        );
        await this.completeIdempotency(tx, idempotency.id, transfer);
        return transfer;
      }
      const dispatched = await this.dispatchTransfer(context, transfer, tx);
      await this.completeIdempotency(tx, idempotency.id, dispatched);
      return dispatched;
    });
  }

  async receiveTransfer(context: TenantContext, transferId: string, input: ReceiveTransferInput) {
    return this.database.db.transaction(async (tx) => {
      const transfer = await this.transfer(context, transferId, tx);
      if (transfer.status !== "awaiting_receipt")
        throw new ConflictException("Transfer is not awaiting receipt");
      if (transfer.version !== input.expectedVersion)
        throw new ConflictException("Transfer version is outdated");
      const lines = await tx
        .select()
        .from(inventoryTransferLines)
        .where(
          and(
            eq(inventoryTransferLines.tenantId, context.tenantId),
            eq(inventoryTransferLines.transferId, transfer.id),
          ),
        );
      if (lines.length !== input.lines.length)
        throw new BadRequestException("All transfer lines must be received");
      const receivedByLineId = new Map(input.lines.map((line) => [line.id, line]));
      const transit = transfer.transitLocationId
        ? await this.location(context, transfer.transitLocationId, tx, transfer.branchId)
        : await this.transitLocation(context, transfer.branchId, tx);
      let maxDivergencePercent = 0;
      for (const line of lines) {
        const received = receivedByLineId.get(line.id);
        if (!received) throw new BadRequestException("Unknown transfer line");
        const quantityReceived = Number(this.nonNegativeQuantity(received.quantityReceived));
        const quantitySent = Number(line.quantitySent);
        if (quantityReceived > quantitySent)
          throw new BadRequestException("Received quantity cannot exceed sent quantity");
        if (quantityReceived !== quantitySent && !received.divergenceReason?.trim()) {
          throw new BadRequestException("Divergence reason is required");
        }
        maxDivergencePercent = Math.max(
          maxDivergencePercent,
          ((quantitySent - quantityReceived) / quantitySent) * 100,
        );
      }
      const settings = await this.settings(context, transfer.branchId, tx);
      if (
        maxDivergencePercent > Number(settings.managerApprovalThreshold) &&
        !context.permissions.includes("tenant:manage")
      ) {
        throw new ForbiddenException("Manager approval is required for this divergence");
      }
      const [claimed] = await tx
        .update(inventoryTransfers)
        .set({
          status: "completed",
          receivedByUserId: context.userId,
          receivedAt: new Date(),
          version: transfer.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryTransfers.tenantId, context.tenantId),
            eq(inventoryTransfers.branchId, transfer.branchId),
            eq(inventoryTransfers.id, transfer.id),
            eq(inventoryTransfers.status, "awaiting_receipt"),
            eq(inventoryTransfers.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!claimed) throw new ConflictException("Transfer changed concurrently");
      for (const line of lines) {
        const received = receivedByLineId.get(line.id) as ReceiveTransferInput["lines"][number];
        const sent = Number(line.quantitySent);
        const quantityReceived = Number(this.nonNegativeQuantity(received.quantityReceived));
        await this.lockStock(tx, context, transfer.branchId, line.inventoryItemId, transit.id);
        await this.lockStock(
          tx,
          context,
          transfer.branchId,
          line.inventoryItemId,
          transfer.destinationLocationId,
        );
        if (quantityReceived > 0) {
          await this.movement(tx, context, {
            branchId: transfer.branchId,
            inventoryItemId: line.inventoryItemId,
            stockLocationId: transit.id,
            type: "transfer_receipt",
            quantity: String(-quantityReceived),
            sourceType: "inventory_transfer",
            sourceId: transfer.id,
            reason: transfer.reason,
          });
          await this.movement(tx, context, {
            branchId: transfer.branchId,
            inventoryItemId: line.inventoryItemId,
            stockLocationId: transfer.destinationLocationId,
            type: "transfer_receipt",
            quantity: String(quantityReceived),
            sourceType: "inventory_transfer",
            sourceId: transfer.id,
            reason: transfer.reason,
          });
        }
        if (sent > quantityReceived)
          await this.movement(tx, context, {
            branchId: transfer.branchId,
            inventoryItemId: line.inventoryItemId,
            stockLocationId: transit.id,
            type: "transfer_divergence",
            quantity: String(quantityReceived - sent),
            sourceType: "inventory_transfer",
            sourceId: transfer.id,
            reason: received.divergenceReason ?? transfer.reason,
          });
        await tx
          .update(inventoryTransferLines)
          .set({
            quantityReceived: String(quantityReceived),
            divergenceReason: received.divergenceReason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(inventoryTransferLines.id, line.id));
      }
      await this.audit(
        context,
        {
          branchId: transfer.branchId,
          action: "inventory.transfer_received",
          entityType: "inventory_transfer",
          entityId: transfer.id,
          metadata: { maxDivergencePercent },
        },
        tx,
      );
      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: transfer.branchId,
        inventoryItemIds: lines.map((line) => line.inventoryItemId),
        movementType: "transfer_receipt",
        movementId: transfer.id,
      });
      return claimed;
    });
  }

  async dispatchDraftTransfer(context: TenantContext, transferId: string, expectedVersion: number) {
    return this.database.db.transaction(async (tx) => {
      const transfer = await this.transfer(context, transferId, tx);
      if (transfer.status !== "draft" || transfer.version !== expectedVersion) {
        throw new ConflictException("Only the current draft can be dispatched");
      }
      return this.dispatchTransfer(context, transfer, tx);
    });
  }

  async cancelTransfer(context: TenantContext, transferId: string, expectedVersion: number) {
    return this.database.db.transaction(async (tx) => {
      const transfer = await this.transfer(context, transferId, tx);
      if (transfer.status !== "draft" || transfer.version !== expectedVersion)
        throw new ConflictException("Only current drafts can be cancelled");
      const [updated] = await tx
        .update(inventoryTransfers)
        .set({ status: "cancelled", version: transfer.version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryTransfers.tenantId, context.tenantId),
            eq(inventoryTransfers.branchId, transfer.branchId),
            eq(inventoryTransfers.id, transfer.id),
            eq(inventoryTransfers.status, "draft"),
            eq(inventoryTransfers.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("Transfer was already cancelled or changed");
      await this.audit(
        context,
        {
          branchId: transfer.branchId,
          action: "inventory.transfer_cancelled",
          entityType: "inventory_transfer",
          entityId: transfer.id,
        },
        tx,
      );
      return updated;
    });
  }

  async reverseTransfer(
    context: TenantContext,
    transferId: string,
    expectedVersion: number,
    reason: string,
  ) {
    return this.database.db.transaction(async (tx) => {
      const transfer = await this.transfer(context, transferId, tx);
      if (
        transfer.status !== "completed" ||
        transfer.version !== expectedVersion ||
        transfer.reversedAt
      )
        throw new ConflictException("Only an unreversed completed transfer can be reversed");
      const [claimed] = await tx
        .update(inventoryTransfers)
        .set({ reversedAt: new Date(), version: transfer.version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryTransfers.tenantId, context.tenantId),
            eq(inventoryTransfers.branchId, transfer.branchId),
            eq(inventoryTransfers.id, transfer.id),
            eq(inventoryTransfers.status, "completed"),
            eq(inventoryTransfers.version, expectedVersion),
            isNull(inventoryTransfers.reversedAt),
          ),
        )
        .returning();
      if (!claimed) throw new ConflictException("Transfer was already reversed or changed");
      const lines = await tx
        .select()
        .from(inventoryTransferLines)
        .where(
          and(
            eq(inventoryTransferLines.tenantId, context.tenantId),
            eq(inventoryTransferLines.transferId, transfer.id),
          ),
        );
      for (const line of lines) {
        const quantity = Number(line.quantityReceived ?? line.quantitySent);
        if (quantity === 0) continue;
        await this.lockStock(
          tx,
          context,
          transfer.branchId,
          line.inventoryItemId,
          transfer.destinationLocationId,
        );
        await this.assertAvailable(
          context,
          transfer.branchId,
          line.inventoryItemId,
          transfer.destinationLocationId,
          quantity,
          tx,
        );
        await this.movement(tx, context, {
          branchId: transfer.branchId,
          inventoryItemId: line.inventoryItemId,
          stockLocationId: transfer.destinationLocationId,
          type: "transfer_reversal",
          quantity: String(-quantity),
          sourceType: "inventory_transfer",
          sourceId: transfer.id,
          reason,
        });
        await this.movement(tx, context, {
          branchId: transfer.branchId,
          inventoryItemId: line.inventoryItemId,
          stockLocationId: transfer.originLocationId,
          type: "transfer_reversal",
          quantity: String(quantity),
          sourceType: "inventory_transfer",
          sourceId: transfer.id,
          reason,
        });
      }
      await this.audit(
        context,
        {
          branchId: transfer.branchId,
          action: "inventory.transfer_reversed",
          entityType: "inventory_transfer",
          entityId: transfer.id,
          metadata: { reason },
        },
        tx,
      );
      return claimed;
    });
  }

  async upsertRecipe(context: TenantContext, input: RecipeInput) {
    const [product] = await this.database.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.id, input.productId)))
      .limit(1);

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.database.db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          tenantId: context.tenantId,
          productId: product.id,
          yieldQuantity: input.yieldQuantity ?? "1",
          technicalLossRate: input.technicalLossRate ?? "0",
        })
        .onConflictDoUpdate({
          target: [recipes.tenantId, recipes.productId],
          set: {
            yieldQuantity: input.yieldQuantity ?? "1",
            technicalLossRate: input.technicalLossRate ?? "0",
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!recipe) {
        throw new Error("Failed to upsert recipe");
      }

      await tx
        .delete(recipeItems)
        .where(
          and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipe.id)),
        );

      const createdItems =
        input.items.length > 0
          ? await tx
              .insert(recipeItems)
              .values(
                input.items.map((item) => ({
                  tenantId: context.tenantId,
                  recipeId: recipe.id,
                  inventoryItemId: item.inventoryItemId,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
              )
              .returning()
          : [];

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "inventory.recipe_upserted",
        entityType: "recipe",
        entityId: recipe.id,
        metadata: { productId: product.id, itemCount: createdItems.length },
      });

      return { ...recipe, items: createdItems };
    });
  }

  async upsertReturnableMapping(
    context: TenantContext,
    input: { productId: string; fullInventoryItemId: string; emptyInventoryItemId: string },
  ) {
    if (input.fullInventoryItemId === input.emptyInventoryItemId)
      throw new BadRequestException("Full and empty items must differ");
    return this.database.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.tenantId, context.tenantId), eq(products.id, input.productId)))
        .limit(1);
      if (!product) throw new NotFoundException("Product not found");
      await this.assertInventoryItems(
        context,
        [input.fullInventoryItemId, input.emptyInventoryItemId],
        tx,
      );
      const [duplicateRecipeConsumption] = await tx
        .select({ id: recipeItems.id })
        .from(recipes)
        .innerJoin(
          recipeItems,
          and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipes.id)),
        )
        .where(
          and(
            eq(recipes.tenantId, context.tenantId),
            eq(recipes.productId, product.id),
            eq(recipeItems.inventoryItemId, input.fullInventoryItemId),
          ),
        )
        .limit(1);
      if (duplicateRecipeConsumption) {
        throw new ConflictException(
          "Full returnable item is already consumed by the product recipe",
        );
      }
      const [mapping] = await tx
        .insert(returnableMappings)
        .values({ tenantId: context.tenantId, ...input })
        .onConflictDoUpdate({
          target: [returnableMappings.tenantId, returnableMappings.productId],
          set: {
            fullInventoryItemId: input.fullInventoryItemId,
            emptyInventoryItemId: input.emptyInventoryItemId,
            updatedAt: new Date(),
          },
        })
        .returning();
      await this.audit(
        context,
        {
          action: "inventory.returnable_mapping_upserted",
          entityType: "returnable_mapping",
          ...(mapping ? { entityId: mapping.id } : {}),
          metadata: input,
        },
        tx,
      );
      return mapping;
    });
  }

  async recordReturnableEvent(
    context: TenantContext,
    input: ReturnableEventInput,
  ): Promise<{ id: string; ok: true }> {
    await this.assertBranch(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      await this.location(context, input.stockLocationId, tx, input.branchId);
      const [mapping] = await tx
        .select()
        .from(returnableMappings)
        .where(
          and(
            eq(returnableMappings.tenantId, context.tenantId),
            eq(returnableMappings.id, input.mappingId),
          ),
        )
        .limit(1);
      if (!mapping) throw new NotFoundException("Returnable mapping not found");
      if (input.type === "supplier_exchange" && !input.supplierId) {
        throw new BadRequestException("Supplier is required for an exchange");
      }
      if (input.supplierId) await this.assertSupplier(context, input.supplierId, tx);
      const idempotency = await this.reserveIdempotency(tx, context, {
        branchId: input.branchId,
        scope: "inventory.returnable.event",
        key: input.idempotencyKey,
        payload: input,
      });
      if (idempotency.response) {
        return idempotency.response as unknown as { id: string; ok: true };
      }
      const quantity = Number(this.positiveQuantity(input.quantity));
      if (input.type === "supplier_exchange") {
        await this.lockStock(
          tx,
          context,
          input.branchId,
          mapping.emptyInventoryItemId,
          input.stockLocationId,
        );
        await this.assertAvailable(
          context,
          input.branchId,
          mapping.emptyInventoryItemId,
          input.stockLocationId,
          quantity,
          tx,
        );
        await this.movement(tx, context, {
          branchId: input.branchId,
          inventoryItemId: mapping.emptyInventoryItemId,
          stockLocationId: input.stockLocationId,
          supplierId: input.supplierId,
          type: "returnable_supplier_exchange",
          quantity: String(-quantity),
          sourceType: "returnable",
          sourceId: idempotency.id,
          reason: input.reason,
        });
        await this.movement(tx, context, {
          branchId: input.branchId,
          inventoryItemId: mapping.fullInventoryItemId,
          stockLocationId: input.stockLocationId,
          supplierId: input.supplierId,
          type: "returnable_supplier_exchange",
          quantity: String(quantity),
          sourceType: "returnable",
          sourceId: idempotency.id,
          reason: input.reason,
        });
      } else {
        await this.lockStock(
          tx,
          context,
          input.branchId,
          mapping.emptyInventoryItemId,
          input.stockLocationId,
        );
        await this.assertAvailable(
          context,
          input.branchId,
          mapping.emptyInventoryItemId,
          input.stockLocationId,
          quantity,
          tx,
        );
        await this.movement(tx, context, {
          branchId: input.branchId,
          inventoryItemId: mapping.emptyInventoryItemId,
          stockLocationId: input.stockLocationId,
          type: input.type === "breakage" ? "returnable_breakage" : "returnable_loss",
          quantity: String(-quantity),
          sourceType: "returnable",
          sourceId: idempotency.id,
          reason: input.reason,
        });
      }
      await this.audit(
        context,
        {
          branchId: input.branchId,
          action: `inventory.${input.type}`,
          entityType: "returnable",
          entityId: idempotency.id,
          metadata: {
            mappingId: mapping.id,
            productId: mapping.productId,
            stockLocationId: input.stockLocationId,
            supplierId: input.supplierId,
            quantity: input.quantity,
            type: input.type,
            reason: input.reason,
          },
        },
        tx,
      );
      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: input.branchId,
        inventoryItemIds:
          input.type === "supplier_exchange"
            ? [mapping.emptyInventoryItemId, mapping.fullInventoryItemId]
            : [mapping.emptyInventoryItemId],
        movementType: `returnable_${input.type}`,
        movementId: idempotency.id,
      });
      const response = { id: idempotency.id, ok: true as const };
      await this.completeIdempotency(tx, idempotency.id, response);
      return response;
    });
  }

  private async dispatchTransfer(
    context: TenantContext,
    transfer: typeof inventoryTransfers.$inferSelect,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    if (transfer.status !== "draft") throw new ConflictException("Only drafts can be dispatched");
    const transit =
      transfer.mode === "awaiting_receipt"
        ? await this.transitLocation(context, transfer.branchId, tx)
        : null;
    const status = transfer.mode === "awaiting_receipt" ? "awaiting_receipt" : "completed";
    const [claimed] = await tx
      .update(inventoryTransfers)
      .set({
        status,
        transitLocationId: transit?.id ?? null,
        dispatchedAt: new Date(),
        ...(status === "completed"
          ? { receivedByUserId: context.userId, receivedAt: new Date() }
          : {}),
        version: transfer.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryTransfers.tenantId, context.tenantId),
          eq(inventoryTransfers.branchId, transfer.branchId),
          eq(inventoryTransfers.id, transfer.id),
          eq(inventoryTransfers.status, "draft"),
          eq(inventoryTransfers.version, transfer.version),
        ),
      )
      .returning();
    if (!claimed) throw new ConflictException("Transfer was already dispatched or changed");
    const lines = await tx
      .select()
      .from(inventoryTransferLines)
      .where(
        and(
          eq(inventoryTransferLines.tenantId, context.tenantId),
          eq(inventoryTransferLines.transferId, transfer.id),
        ),
      );
    for (const line of lines) {
      const quantity = Number(line.quantitySent);
      await this.lockStock(
        tx,
        context,
        transfer.branchId,
        line.inventoryItemId,
        transfer.originLocationId,
      );
      await this.lockStock(
        tx,
        context,
        transfer.branchId,
        line.inventoryItemId,
        transit?.id ?? transfer.destinationLocationId,
      );
      await this.assertAvailable(
        context,
        transfer.branchId,
        line.inventoryItemId,
        transfer.originLocationId,
        quantity,
        tx,
      );
      await this.movement(tx, context, {
        branchId: transfer.branchId,
        inventoryItemId: line.inventoryItemId,
        stockLocationId: transfer.originLocationId,
        type: "transfer_dispatch",
        quantity: String(-quantity),
        sourceType: "inventory_transfer",
        sourceId: transfer.id,
        reason: transfer.reason,
      });
      await this.movement(tx, context, {
        branchId: transfer.branchId,
        inventoryItemId: line.inventoryItemId,
        stockLocationId: transit?.id ?? transfer.destinationLocationId,
        type: "transfer_dispatch",
        quantity: String(quantity),
        sourceType: "inventory_transfer",
        sourceId: transfer.id,
        reason: transfer.reason,
      });
    }
    await this.audit(
      context,
      {
        branchId: transfer.branchId,
        action: `inventory.transfer_${status}`,
        entityType: "inventory_transfer",
        entityId: transfer.id,
      },
      tx,
    );
    await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
      branchId: transfer.branchId,
      inventoryItemIds: lines.map((line) => line.inventoryItemId),
      movementType: "transfer_dispatch",
      movementId: transfer.id,
    });
    return claimed;
  }

  private positiveQuantity(quantity: string) {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new BadRequestException("Quantity must be greater than zero");
    return String(parsed);
  }

  private nonNegativeQuantity(quantity: string) {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed < 0)
      throw new BadRequestException("Quantity cannot be negative");
    return String(parsed);
  }

  private async reserveIdempotency(
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
    context: TenantContext,
    input: { branchId: string; scope: string; key: string; payload: unknown },
  ) {
    const requestHash = createHash("sha256").update(stableJson(input.payload)).digest("hex");
    const [reserved] = await tx
      .insert(operationIdempotency)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        scope: input.scope,
        idempotencyKey: input.key,
        requestHash,
      })
      .onConflictDoNothing()
      .returning({ id: operationIdempotency.id });
    if (reserved) return { id: reserved.id, response: null };
    const [existing] = await tx
      .select()
      .from(operationIdempotency)
      .where(
        and(
          eq(operationIdempotency.tenantId, context.tenantId),
          eq(operationIdempotency.branchId, input.branchId),
          eq(operationIdempotency.scope, input.scope),
          eq(operationIdempotency.idempotencyKey, input.key),
        ),
      )
      .limit(1);
    if (!existing || existing.requestHash !== requestHash) {
      throw new ConflictException("Idempotency key was already used with a different payload");
    }
    if (!existing.response) {
      throw new ConflictException("Request with this idempotency key is still being processed");
    }
    return { id: existing.id, response: existing.response };
  }

  private async completeIdempotency(
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
    id: string,
    response: object,
  ) {
    await tx
      .update(operationIdempotency)
      .set({
        status: "completed",
        response: JSON.parse(JSON.stringify(response)) as Record<string, unknown>,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(operationIdempotency.id, id));
  }

  private async assertInventoryItems(
    context: TenantContext,
    inventoryItemIds: string[],
    client: InventoryDatabaseClient,
  ) {
    const uniqueIds = [...new Set(inventoryItemIds)];
    const rows = await client
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.tenantId, context.tenantId), inArray(inventoryItems.id, uniqueIds)),
      );
    if (rows.length !== uniqueIds.length) throw new NotFoundException("Inventory item not found");
  }

  private async assertSupplier(
    context: TenantContext,
    supplierId: string,
    client: InventoryDatabaseClient,
  ) {
    const [supplier] = await client
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, context.tenantId), eq(suppliers.id, supplierId)))
      .limit(1);
    if (!supplier) throw new NotFoundException("Supplier not found");
  }

  private async transferByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    const [transfer] = await tx
      .select()
      .from(inventoryTransfers)
      .where(
        and(
          eq(inventoryTransfers.tenantId, context.tenantId),
          eq(inventoryTransfers.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!transfer) throw new ConflictException("Transfer idempotency conflict");
    return transfer;
  }

  private async assertTransferPayload(
    transfer: typeof inventoryTransfers.$inferSelect,
    input: TransferInput,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    const lines = await tx
      .select()
      .from(inventoryTransferLines)
      .where(
        and(
          eq(inventoryTransferLines.tenantId, transfer.tenantId),
          eq(inventoryTransferLines.transferId, transfer.id),
        ),
      );
    const expected = [...input.lines]
      .map((line) => `${line.inventoryItemId}:${Number(line.quantity)}`)
      .sort();
    const actual = lines
      .map((line) => `${line.inventoryItemId}:${Number(line.quantitySent)}`)
      .sort();
    if (
      transfer.branchId !== input.branchId ||
      transfer.originLocationId !== input.originLocationId ||
      transfer.destinationLocationId !== input.destinationLocationId ||
      transfer.reason !== input.reason ||
      stableJson(actual) !== stableJson(expected) ||
      (input.submit === false && transfer.status !== "draft")
    ) {
      throw new ConflictException("Idempotency key was already used with a different payload");
    }
  }

  private async movement(
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
    context: TenantContext,
    values: Omit<typeof stockMovements.$inferInsert, "tenantId">,
  ) {
    const [movement] = await tx
      .insert(stockMovements)
      .values({ tenantId: context.tenantId, ...values })
      .returning();
    if (!movement) throw new Error("Failed to create stock movement");
    return movement;
  }

  private async lockStock(
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
    context: TenantContext,
    branchId: string,
    inventoryItemId: string,
    locationId: string,
  ) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${context.tenantId}:${branchId}:${inventoryItemId}:${locationId}`}))`,
    );
  }

  private async assertAvailable(
    context: TenantContext,
    branchId: string,
    inventoryItemId: string,
    locationId: string,
    quantity: number,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    const [item] = await tx
      .select({ allowNegative: inventoryItems.allowNegative })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.tenantId, context.tenantId), eq(inventoryItems.id, inventoryItemId)),
      )
      .limit(1);
    if (!item) throw new NotFoundException("Inventory item not found");
    if (item.allowNegative) return;
    const current = await this.currentQuantity(context, branchId, inventoryItemId, tx, locationId);
    if (current < quantity) throw new ConflictException("Insufficient stock at origin location");
  }

  private async transfer(
    context: TenantContext,
    transferId: string,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    const [transfer] = await tx
      .select()
      .from(inventoryTransfers)
      .where(
        and(
          eq(inventoryTransfers.tenantId, context.tenantId),
          eq(inventoryTransfers.id, transferId),
        ),
      )
      .limit(1);
    if (!transfer) throw new NotFoundException("Transfer not found");
    return transfer;
  }

  private async settings(
    context: TenantContext,
    branchId: string,
    client: InventoryDatabaseClient = this.database.db,
  ) {
    const [settings] = await client
      .select()
      .from(branchInventorySettings)
      .where(
        and(
          eq(branchInventorySettings.tenantId, context.tenantId),
          eq(branchInventorySettings.branchId, branchId),
        ),
      )
      .limit(1);
    return (
      settings ?? {
        transferMode: "immediate",
        managerApprovalThreshold: "0",
        consumptionLocationId: null,
      }
    );
  }

  private async location(
    context: TenantContext,
    locationId: string,
    client: InventoryDatabaseClient = this.database.db,
    branchId?: string,
  ) {
    const [location] = await client
      .select()
      .from(stockLocations)
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.id, locationId),
          ...(branchId ? [eq(stockLocations.branchId, branchId)] : []),
          isNull(stockLocations.archivedAt),
        ),
      )
      .limit(1);
    if (!location) throw new NotFoundException("Stock location not found");
    return location;
  }

  private async assertTransferLocations(
    context: TenantContext,
    branchId: string,
    originId: string,
    destinationId: string,
    client: InventoryDatabaseClient,
  ) {
    await this.lockLocations(client, context, [originId, destinationId]);
    const locations = await client
      .select()
      .from(stockLocations)
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.branchId, branchId),
          inArray(stockLocations.id, [originId, destinationId]),
          isNull(stockLocations.archivedAt),
        ),
      );
    if (locations.length !== 2) throw new NotFoundException("Transfer location not found");
  }

  private async lockLocations(
    client: InventoryDatabaseClient,
    context: TenantContext,
    locationIds: string[],
  ) {
    for (const locationId of [...new Set(locationIds)].sort()) {
      await client.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`inventory-location:${context.tenantId}:${locationId}`}))`,
      );
    }
  }

  private async transitLocation(
    context: TenantContext,
    branchId: string,
    client: InventoryDatabaseClient,
  ) {
    const [created] = await client
      .insert(stockLocations)
      .values({ tenantId: context.tenantId, branchId, name: "Em trânsito", type: "transit" })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [existing] = await client
      .select()
      .from(stockLocations)
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.branchId, branchId),
          eq(stockLocations.type, "transit"),
          isNull(stockLocations.archivedAt),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Failed to resolve transit location");
    return existing;
  }

  private async defaultLocationId(
    context: TenantContext,
    branchId: string,
    client: InventoryDatabaseClient = this.database.db,
  ) {
    const inventorySettings = await this.settings(context, branchId, client);
    if (inventorySettings.consumptionLocationId) {
      const configured = await this.location(
        context,
        inventorySettings.consumptionLocationId,
        client,
        branchId,
      );
      if (configured.type === "transit") {
        throw new ConflictException("Consumption location cannot be transit");
      }
      return configured.id;
    }
    const [location] = await client
      .select()
      .from(stockLocations)
      .where(
        and(
          eq(stockLocations.tenantId, context.tenantId),
          eq(stockLocations.branchId, branchId),
          sql`${stockLocations.type} <> 'transit'`,
          isNull(stockLocations.archivedAt),
        ),
      )
      .orderBy(
        sql`case when ${stockLocations.type} in ('stock', 'main') then 0 else 1 end`,
        stockLocations.createdAt,
      )
      .limit(1);

    if (location) {
      return location.id;
    }

    const [created] = await client
      .insert(stockLocations)
      .values({
        tenantId: context.tenantId,
        branchId,
        name: "Estoque principal",
        type: "stock",
      })
      .returning();

    return created?.id;
  }

  private async currentQuantity(
    context: TenantContext,
    branchId: string,
    inventoryItemId: string,
    client: InventoryDatabaseClient = this.database.db,
    stockLocationId?: string,
  ) {
    const [row] = await client
      .select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.branchId, branchId),
          eq(stockMovements.inventoryItemId, inventoryItemId),
          ...(stockLocationId ? [eq(stockMovements.stockLocationId, stockLocationId)] : []),
        ),
      );
    return Number(row?.quantity ?? 0);
  }

  private normalizeMovementQuantity(
    type: StockAdjustmentInput["type"],
    quantity: string,
    current: number,
  ) {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed === 0) {
      throw new Error("Stock movement quantity must be non-zero");
    }
    if (type === "inventory_count") return String(parsed - current);
    if (type === "loss") return String(-Math.abs(parsed));
    if (type === "purchase_receipt") return String(Math.abs(parsed));
    return String(parsed);
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);

    if (!branch) {
      throw new NotFoundException("Branch not found");
    }
  }

  private async audit(
    context: TenantContext,
    input: {
      branchId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
    client: InventoryDatabaseClient = this.database.db,
  ) {
    await client.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId ?? context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
