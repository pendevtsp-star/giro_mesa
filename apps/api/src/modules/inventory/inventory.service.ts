import {
  auditLogs,
  branches,
  inventoryItems,
  products,
  recipeItems,
  recipes,
  stockLocations,
  stockMovements,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

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
  type: "purchase_receipt" | "loss" | "inventory_count" | "manual_adjustment";
  quantity: string;
  unitCostCents?: number | undefined;
  reason: string;
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
        and(eq(stockLocations.tenantId, context.tenantId), eq(stockLocations.branchId, branchId)),
      )
      .orderBy(stockLocations.name);
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

    const [item] = await this.database.db
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

    const currentQuantity = await this.currentQuantity(context, input.branchId, item.id);
    const quantity = this.normalizeMovementQuantity(input.type, input.quantity, currentQuantity);
    const stockLocationId =
      input.stockLocationId ?? (await this.defaultLocationId(context, input.branchId));
    const [movement] = await this.database.db
      .insert(stockMovements)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        inventoryItemId: item.id,
        stockLocationId,
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
      await this.database.db
        .update(inventoryItems)
        .set({ averageCostCents: input.unitCostCents, updatedAt: new Date() })
        .where(and(eq(inventoryItems.tenantId, context.tenantId), eq(inventoryItems.id, item.id)));
    }

    await this.audit(context, {
      branchId: input.branchId,
      action: `inventory.${input.type}`,
      entityType: "stock_movement",
      entityId: movement.id,
      metadata: { inventoryItemId: item.id, quantity, type: input.type, reason: input.reason },
    });

    return movement;
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

  private async defaultLocationId(context: TenantContext, branchId: string) {
    const [location] = await this.database.db
      .select()
      .from(stockLocations)
      .where(
        and(eq(stockLocations.tenantId, context.tenantId), eq(stockLocations.branchId, branchId)),
      )
      .limit(1);

    if (location) {
      return location.id;
    }

    const [created] = await this.database.db
      .insert(stockLocations)
      .values({
        tenantId: context.tenantId,
        branchId,
        name: "Estoque principal",
        type: "main",
      })
      .returning();

    return created?.id;
  }

  private async currentQuantity(context: TenantContext, branchId: string, inventoryItemId: string) {
    const [row] = await this.database.db
      .select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.branchId, branchId),
          eq(stockMovements.inventoryItemId, inventoryItemId),
        ),
      );
    return Number(row?.quantity ?? 0);
  }

  private normalizeMovementQuantity(type: StockAdjustmentInput["type"], quantity: string, current: number) {
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
  ) {
    await this.database.db.insert(auditLogs).values({
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
