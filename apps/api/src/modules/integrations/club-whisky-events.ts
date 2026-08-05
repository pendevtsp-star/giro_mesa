import {
  branches,
  integrationAccounts,
  inventoryItems,
  outboxEvents,
  products,
  recipeItems,
  recipes,
  stockMovements,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";
import { readClubWhiskyBranchId } from "./club-whisky-branch";

export const CLUB_WHISKY_CONTRACT_VERSION = "2026-07-30";

type EventDatabaseClient = Pick<DatabaseService["db"], "insert" | "select">;
type ProductSnapshot = Pick<
  typeof products.$inferSelect,
  | "id"
  | "name"
  | "description"
  | "priceCents"
  | "isActive"
  | "isAvailable"
  | "isClubEligible"
  | "bottleVolumeMl"
  | "defaultDoseMl"
  | "spiritType"
  | "channels"
  | "updatedAt"
>;

async function activeClubWhiskyIntegrationBranch(client: EventDatabaseClient, tenantId: string) {
  const [account] = await client
    .select({ config: integrationAccounts.config })
    .from(integrationAccounts)
    .where(
      and(
        eq(integrationAccounts.tenantId, tenantId),
        eq(integrationAccounts.provider, "club_whisky"),
        eq(integrationAccounts.status, "active"),
      ),
    )
    .limit(1);

  const branchId = account ? readClubWhiskyBranchId(account.config) : null;
  if (!branchId) return null;
  const [ownedBranch] = await client
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), eq(branches.id, branchId)))
    .limit(1);
  return ownedBranch?.id ?? null;
}

export async function enqueueClubWhiskyProductUpdated(
  client: EventDatabaseClient,
  context: TenantContext,
  product: ProductSnapshot,
  reason: "created" | "updated",
) {
  const branchId = await activeClubWhiskyIntegrationBranch(client, context.tenantId);
  if (!branchId) {
    return false;
  }

  await client.insert(outboxEvents).values({
    tenantId: context.tenantId,
    topic: "product.updated",
    payload: {
      integration: "club_whisky",
      contractVersion: CLUB_WHISKY_CONTRACT_VERSION,
      correlationId: context.requestId,
      branchId,
      reason,
      productId: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      isActive: product.isActive,
      isAvailable: product.isAvailable,
      isClubEligible: product.isClubEligible,
      bottleVolumeMl: product.bottleVolumeMl,
      defaultDoseMl: product.defaultDoseMl,
      spiritType: product.spiritType,
      channels: product.channels,
      updatedAt: product.updatedAt.toISOString(),
    },
  });

  return true;
}

export async function enqueueClubWhiskyStockUpdatedForInventoryItems(
  client: EventDatabaseClient,
  context: TenantContext,
  input: {
    branchId: string;
    inventoryItemIds: string[];
    movementType: string;
    movementId?: string | undefined;
  },
) {
  const inventoryItemIds = [...new Set(input.inventoryItemIds)];
  const configuredBranchId = await activeClubWhiskyIntegrationBranch(client, context.tenantId);
  if (inventoryItemIds.length === 0 || configuredBranchId !== input.branchId) {
    return 0;
  }

  const rawMappings = await client
    .select({
      productId: products.id,
      inventoryItemId: recipeItems.inventoryItemId,
    })
    .from(products)
    .innerJoin(
      recipes,
      and(eq(recipes.tenantId, context.tenantId), eq(recipes.productId, products.id)),
    )
    .innerJoin(
      recipeItems,
      and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipes.id)),
    )
    .innerJoin(
      inventoryItems,
      and(
        eq(inventoryItems.tenantId, context.tenantId),
        eq(inventoryItems.id, recipeItems.inventoryItemId),
      ),
    )
    .where(
      and(
        eq(products.tenantId, context.tenantId),
        eq(products.isClubEligible, true),
        inArray(recipeItems.inventoryItemId, inventoryItemIds),
        sql`lower(${inventoryItems.unit}) = 'ml'`,
        sql`lower(${recipeItems.unit}) = 'ml'`,
      ),
    );

  const mappingsByProduct = new Map<string, Set<string>>();
  for (const mapping of rawMappings) {
    const itemIds = mappingsByProduct.get(mapping.productId) ?? new Set<string>();
    itemIds.add(mapping.inventoryItemId);
    mappingsByProduct.set(mapping.productId, itemIds);
  }

  const mappings = [...mappingsByProduct.entries()]
    .filter(([, itemIds]) => itemIds.size === 1)
    .map(([productId, itemIds]) => ({
      productId,
      inventoryItemId: [...itemIds][0] as string,
    }));

  if (mappings.length === 0) {
    return 0;
  }

  const mappedInventoryItemIds = [...new Set(mappings.map((mapping) => mapping.inventoryItemId))];
  const stockRows = await client
    .select({
      inventoryItemId: stockMovements.inventoryItemId,
      availableMl: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, context.tenantId),
        eq(stockMovements.branchId, input.branchId),
        inArray(stockMovements.inventoryItemId, mappedInventoryItemIds),
      ),
    )
    .groupBy(stockMovements.inventoryItemId);

  const availableByInventoryItem = new Map(
    stockRows.map((row) => [row.inventoryItemId, Number(row.availableMl)]),
  );
  const changedAt = new Date().toISOString();

  await client.insert(outboxEvents).values(
    mappings.map((mapping) => ({
      tenantId: context.tenantId,
      topic: "stock.updated",
      payload: {
        integration: "club_whisky",
        contractVersion: CLUB_WHISKY_CONTRACT_VERSION,
        correlationId: context.requestId,
        productId: mapping.productId,
        branchId: input.branchId,
        inventoryItemId: mapping.inventoryItemId,
        availableMl: availableByInventoryItem.get(mapping.inventoryItemId) ?? 0,
        unit: "ml",
        movementType: input.movementType,
        movementId: input.movementId,
        changedAt,
      },
    })),
  );

  return mappings.length;
}
