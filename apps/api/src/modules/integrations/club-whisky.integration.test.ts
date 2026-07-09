import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  categories,
  integrationAccounts,
  inventoryItems,
  outboxEvents,
  products,
  recipeItems,
  recipes,
  stockLocations,
  stockMovements,
  tenants,
  webhookEvents,
} from "@giromesa/db";
import { ForbiddenException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIntegrationApiKey } from "../../common/integration-key";
import type { DatabaseService } from "../database/database.service";
import { ClubWhiskyService } from "./club-whisky.service";
import { IntegrationAuthService } from "./integration-auth.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(webhookEvents).where(eq(webhookEvents.tenantId, tenantId));
  await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
  await db.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));
  await db.delete(recipeItems).where(eq(recipeItems.tenantId, tenantId));
  await db.delete(recipes).where(eq(recipes.tenantId, tenantId));
  await db.delete(stockLocations).where(eq(stockLocations.tenantId, tenantId));
  await db.delete(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(categories).where(eq(categories.tenantId, tenantId));
  await db.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function createTenantFixture(
  db: Db,
  input: {
    slug: string;
    name: string;
    apiKeyScopes: string[];
    branchScoped: boolean;
  },
) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: input.name,
      slug: input.slug,
      status: "active",
    })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create integration test tenant");
  }

  const [mainBranch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Matriz" })
    .returning();
  const [otherBranch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Outra unidade" })
    .returning();

  if (!mainBranch || !otherBranch) {
    throw new Error("Failed to create integration test branches");
  }

  const [category] = await db
    .insert(categories)
    .values({
      tenantId: tenant.id,
      branchId: mainBranch.id,
      name: "Destilados",
    })
    .returning();

  if (!category) {
    throw new Error("Failed to create integration test category");
  }

  const [product] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: category.id,
      name: `${input.name} Whisky 1000ml`,
      priceCents: 50000,
      costCents: 25000,
      isClubEligible: true,
      bottleVolumeMl: 1000,
      defaultDoseMl: 50,
      spiritType: "whisky",
      channels: ["pos"],
    })
    .returning();

  const [inventoryItem] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: `${input.name} Whisky`,
      unit: "ml",
      averageCostCents: 25,
      minQuantity: "0",
    })
    .returning();

  const [stockLocation] = await db
    .insert(stockLocations)
    .values({
      tenantId: tenant.id,
      branchId: mainBranch.id,
      name: "Bar",
      type: "bar",
    })
    .returning();

  if (!product || !inventoryItem || !stockLocation) {
    throw new Error("Failed to create integration test catalog");
  }

  const [recipe] = await db
    .insert(recipes)
    .values({
      tenantId: tenant.id,
      productId: product.id,
      yieldQuantity: "1",
    })
    .returning();

  if (!recipe) {
    throw new Error("Failed to create integration test recipe");
  }

  await db.insert(recipeItems).values({
    tenantId: tenant.id,
    recipeId: recipe.id,
    inventoryItemId: inventoryItem.id,
    quantity: "1000",
    unit: "ml",
  });

  await db.insert(stockMovements).values({
    tenantId: tenant.id,
    branchId: mainBranch.id,
    inventoryItemId: inventoryItem.id,
    stockLocationId: stockLocation.id,
    type: "initial_balance",
    quantity: "1000",
    unitCostCents: 25,
    reason: "Integration test initial balance",
  });

  const apiKey = createIntegrationApiKey("club_whisky");

  await db.insert(integrationAccounts).values({
    tenantId: tenant.id,
    provider: "club_whisky",
    status: "active",
    config: {
      branchId: input.branchScoped ? mainBranch.id : undefined,
      scopes: input.apiKeyScopes,
      webhookUrl: null,
      webhookSecretRef: "CLUB_WHISKY_WEBHOOK_SECRET",
    },
    secretRef: "CLUB_WHISKY_API_KEY",
    apiKeyHash: apiKey.tokenHash,
    apiKeyLastFour: apiKey.lastFour,
    apiKeyCreatedAt: new Date(),
  });

  return {
    tenant,
    mainBranch,
    otherBranch,
    product,
    inventoryItem,
    apiKey: apiKey.token,
  };
}

runIntegration("club whisky integration database behavior", () => {
  let pool: Pool;
  let db: Db;
  let clubWhiskyService: ClubWhiskyService;
  let integrationAuthService: IntegrationAuthService;
  let tenantA: Awaited<ReturnType<typeof createTenantFixture>>;
  let tenantB: Awaited<ReturnType<typeof createTenantFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    const databaseService = { db } as DatabaseService;
    clubWhiskyService = new ClubWhiskyService(databaseService);
    integrationAuthService = new IntegrationAuthService(databaseService);

    tenantA = await createTenantFixture(db, {
      slug: `club-it-a-${Date.now()}`,
      name: "Tenant A",
      branchScoped: true,
      apiKeyScopes: [
        "branches:read",
        "products:read",
        "stock:read",
        "club_sales:write",
        "club_consumption:write",
        "customers:link",
      ],
    });

    tenantB = await createTenantFixture(db, {
      slug: `club-it-b-${Date.now()}`,
      name: "Tenant B",
      branchScoped: false,
      apiKeyScopes: ["branches:read"],
    });
  });

  afterAll(async () => {
    if (tenantA?.tenant.id) {
      await cleanupTenant(db, tenantA.tenant.id);
    }
    if (tenantB?.tenant.id) {
      await cleanupTenant(db, tenantB.tenant.id);
    }
    await pool.end();
  });

  it("resolves tenant and branch from the integration API key and isolates catalog data", async () => {
    const context = await integrationAuthService.resolveContext(
      { "x-giromesa-integration-key": tenantA.apiKey },
      "club_whisky",
      "products:read",
    );

    expect(context.tenantId).toBe(tenantA.tenant.id);
    expect(context.branchId).toBe(tenantA.mainBranch.id);

    const products = await clubWhiskyService.listEligibleProducts(context);

    expect(products.map((product) => product.id)).toContain(tenantA.product.id);
    expect(products.map((product) => product.id)).not.toContain(tenantB.product.id);
  });

  it("rejects scopes that were not granted to the integration key", async () => {
    await expect(
      integrationAuthService.resolveContext(
        { "x-giromesa-integration-key": tenantB.apiKey },
        "club_whisky",
        "stock:read",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks branch-scoped keys from writing stock movements in another branch", async () => {
    const context = await integrationAuthService.resolveContext(
      { "x-giromesa-integration-key": tenantA.apiKey },
      "club_whisky",
      "club_sales:write",
    );

    await expect(
      clubWhiskyService.registerClubSale(context, {
        branchId: tenantA.otherBranch.id,
        productId: tenantA.product.id,
        quantityBottles: 1,
        externalClubId: "club-forbidden-branch",
        idempotencyKey: "club-forbidden-branch-key",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps club sale idempotent and records dose consumption without double stock decrement", async () => {
    const context = await integrationAuthService.resolveContext(
      { "x-giromesa-integration-key": tenantA.apiKey },
      "club_whisky",
      "club_sales:write",
    );

    const saleInput = {
      branchId: tenantA.mainBranch.id,
      productId: tenantA.product.id,
      quantityBottles: 1,
      externalClubId: "club-idempotent-sale",
      idempotencyKey: "club-idempotent-sale-key",
    };

    const firstSale = await clubWhiskyService.registerClubSale(context, saleInput);
    const duplicateSale = await clubWhiskyService.registerClubSale(context, saleInput);

    expect(firstSale.duplicate).toBe(false);
    expect(duplicateSale.duplicate).toBe(true);

    const [saleMovement] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantA.tenant.id),
          eq(stockMovements.branchId, tenantA.mainBranch.id),
          eq(stockMovements.inventoryItemId, tenantA.inventoryItem.id),
          eq(stockMovements.type, "club_bottle_sale"),
        ),
      );

    expect(saleMovement?.count).toBe(1);
    expect(Number(saleMovement?.total)).toBe(-1000);

    await clubWhiskyService.registerDoseConsumption(context, {
      branchId: tenantA.mainBranch.id,
      productId: tenantA.product.id,
      externalClubId: "club-idempotent-sale",
      externalConsumptionId: "consumption-001",
      doseMl: 50,
      idempotencyKey: "club-dose-consumed-key",
    });

    const [stockTotal] = await db
      .select({
        total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantA.tenant.id),
          eq(stockMovements.branchId, tenantA.mainBranch.id),
          eq(stockMovements.inventoryItemId, tenantA.inventoryItem.id),
        ),
      );

    const [doseMovement] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantA.tenant.id),
          eq(stockMovements.branchId, tenantA.mainBranch.id),
          eq(stockMovements.inventoryItemId, tenantA.inventoryItem.id),
          eq(stockMovements.type, "club_dose_consumed"),
        ),
      );

    expect(Number(stockTotal?.total)).toBe(0);
    expect(doseMovement?.count).toBe(1);
    expect(Number(doseMovement?.total)).toBe(0);
  });
});
