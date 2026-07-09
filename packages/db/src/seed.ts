import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  auditLogs,
  branches,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  fiscalDocuments,
  fiscalSettings,
  floorPlans,
  integrationAccounts,
  inventoryItems,
  invitations,
  kdsStations,
  kdsTickets,
  mfaRecoveryCodes,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  outboxEvents,
  passwordResetTokens,
  payments,
  plans,
  printerDevices,
  printJobs,
  printRoutes,
  products,
  recipeItems,
  recipes,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
  tabs,
  tenants,
  userRoles,
  users,
  webhookEvents,
} from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa";
const passwordPepper = process.env.PASSWORD_PEPPER ?? "local-development-password-pepper";

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

async function resetDemoTenant() {
  const [existingTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, "bar-aurora-demo"))
    .limit(1);

  if (!existingTenant) {
    return;
  }

  const tenantId = existingTenant.id;

  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(webhookEvents).where(eq(webhookEvents.tenantId, tenantId));
  await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
  await db.delete(printJobs).where(eq(printJobs.tenantId, tenantId));
  await db.delete(kdsTickets).where(eq(kdsTickets.tenantId, tenantId));
  await db.delete(printRoutes).where(eq(printRoutes.tenantId, tenantId));
  await db.delete(printerDevices).where(eq(printerDevices.tenantId, tenantId));
  await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(deliveryOrders).where(eq(deliveryOrders.tenantId, tenantId));
  await db.delete(fiscalDocuments).where(eq(fiscalDocuments.tenantId, tenantId));
  await db.delete(fiscalSettings).where(eq(fiscalSettings.tenantId, tenantId));
  await db.delete(tabs).where(eq(tabs.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(cashSessions).where(eq(cashSessions.tenantId, tenantId));
  await db.delete(modifierOptions).where(eq(modifierOptions.tenantId, tenantId));
  await db.delete(modifierGroups).where(eq(modifierGroups.tenantId, tenantId));
  await db.delete(recipeItems).where(eq(recipeItems.tenantId, tenantId));
  await db.delete(recipes).where(eq(recipes.tenantId, tenantId));
  await db.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));
  await db.delete(stockLocations).where(eq(stockLocations.tenantId, tenantId));
  await db.delete(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(categories).where(eq(categories.tenantId, tenantId));
  await db.delete(kdsStations).where(eq(kdsStations.tenantId, tenantId));
  await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
  await db.delete(floorPlans).where(eq(floorPlans.tenantId, tenantId));
  await db.delete(customers).where(eq(customers.tenantId, tenantId));
  await db.delete(invitations).where(eq(invitations.tenantId, tenantId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tenantId, tenantId));
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.tenantId, tenantId));
  await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
  await db.delete(userRoles).where(eq(userRoles.tenantId, tenantId));
  await db.delete(roles).where(eq(roles.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
  await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function upsertDemo() {
  await resetDemoTenant();

  const [starterPlan] = await db
    .insert(plans)
    .values({
      code: "starter",
      name: "Starter",
      priceCents: 14900,
      limits: { branches: 1, users: 5, products: 150 },
    })
    .onConflictDoUpdate({
      target: plans.code,
      set: {
        name: "Starter",
        priceCents: 14900,
        limits: { branches: 1, users: 5, products: 150 },
      },
    })
    .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Bar Aurora Demo",
      slug: "bar-aurora-demo",
      status: "trial",
      settings: {
        branding: {
          displayName: "Bar Aurora",
          logoUrl: null,
          themeMode: "light",
          accentPreset: "emerald",
        },
      },
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: "Bar Aurora Demo",
        status: "trial",
        settings: {
          branding: {
            displayName: "Bar Aurora",
            logoUrl: null,
            themeMode: "light",
            accentPreset: "emerald",
          },
        },
      },
    })
    .returning();

  if (!tenant || !starterPlan) {
    throw new Error("Failed to seed tenant or plan");
  }

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: "Matriz",
    })
    .returning();

  if (!branch) {
    throw new Error("Failed to seed branch");
  }

  await db.insert(subscriptions).values({
    tenantId: tenant.id,
    planId: starterPlan.id,
    provider: "asaas",
    status: "trial",
    currentPeriodEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  const [ownerRole] = await db
    .insert(roles)
    .values({
      tenantId: tenant.id,
      code: "owner",
      name: "Proprietario",
      permissions: [
        "tenant:manage",
        "catalog:manage",
        "pos:operate",
        "pos:qr_review",
        "pos:kds_send",
        "pos:payment_manage",
        "pos:close_order",
        "kds:operate",
        "cash:manage",
        "fiscal:read",
        "fiscal:manage",
        "hardware:manage",
        "print:operate",
        "inventory:manage",
        "reports:read",
      ],
    })
    .returning();

  if (!ownerRole) {
    throw new Error("Failed to seed owner role");
  }

  const passwordHash = await argon2.hash(`Demo@12345${passwordPepper}`, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const [owner] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: "admin@bar-aurora-demo.local",
      name: "Admin Demo",
      passwordHash,
    })
    .onConflictDoUpdate({
      target: [users.email, users.tenantId],
      set: {
        name: "Admin Demo",
        passwordHash,
        isActive: true,
      },
    })
    .returning();

  if (!owner) {
    throw new Error("Failed to seed owner");
  }

  await db.insert(userRoles).values({
    tenantId: tenant.id,
    userId: owner.id,
    roleId: ownerRole.id,
    branchId: branch.id,
  });

  const [kitchen] = await db
    .insert(kdsStations)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Cozinha",
      type: "kitchen",
    })
    .returning();

  const [bar] = await db
    .insert(kdsStations)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Bar",
      type: "bar",
    })
    .returning();

  const [kitchenPrinter] = await db
    .insert(printerDevices)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Termica Cozinha",
      role: "kitchen",
      connectionType: "network",
      address: "192.168.15.41",
      port: 9100,
      paperWidth: 80,
      charactersPerLine: 48,
    })
    .returning();

  const [barPrinter] = await db
    .insert(printerDevices)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Termica Bar",
      role: "bar",
      connectionType: "network",
      address: "192.168.15.42",
      port: 9100,
      paperWidth: 80,
      charactersPerLine: 48,
    })
    .returning();

  const tableSeeds = [
    ["M01", "Mesa 1", 4, "free"],
    ["M02", "Mesa 2", 2, "occupied"],
    ["M03", "Mesa 3", 4, "preparing"],
    ["M04", "Mesa 4", 4, "waiting_payment"],
    ["M05", "Mesa 5", 6, "reserved"],
    ["M06", "Mesa 6", 5, "served"],
    ["M07", "Mesa 7", 2, "free"],
    ["M08", "Mesa 8", 2, "order_sent"],
    ["M09", "Mesa 9", 4, "free"],
    ["M10", "Mesa 10", 8, "blocked"],
    ["M11", "Mesa 11", 2, "waiting_order"],
    ["M12", "Mesa 12", 4, "occupied"],
  ] as const;

  for (const [code, name, seats, status] of tableSeeds) {
    await db.insert(diningTables).values({
      tenantId: tenant.id,
      branchId: branch.id,
      code,
      name,
      seats,
      status,
    });
  }

  const [foodCategory] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Hamburgueres", sortOrder: 1 })
    .returning();
  const [drinkCategory] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Bebidas", sortOrder: 2 })
    .returning();
  const [pizzaCategory] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Pizzas", sortOrder: 3 })
    .returning();
  const [dessertCategory] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Sobremesas", sortOrder: 4 })
    .returning();
  const [spiritsCategory] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Destilados", sortOrder: 5 })
    .returning();

  if (
    !foodCategory ||
    !drinkCategory ||
    !pizzaCategory ||
    !dessertCategory ||
    !spiritsCategory ||
    !kitchen ||
    !bar ||
    !kitchenPrinter ||
    !barPrinter
  ) {
    throw new Error("Failed to seed catalog base");
  }

  await db.insert(printRoutes).values([
    {
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Cozinha recebe pedidos do KDS",
      trigger: "kds_ticket_created",
      targetType: "kitchen_ticket",
      stationId: kitchen.id,
      printerDeviceId: kitchenPrinter.id,
      copies: 1,
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Bar recebe bebidas do KDS",
      trigger: "kds_ticket_created",
      targetType: "bar_ticket",
      stationId: bar.id,
      printerDeviceId: barPrinter.id,
      copies: 1,
    },
  ]);

  const [burger] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: foodCategory.id,
      name: "Burger Classico",
      description: "Blend da casa, queijo, molho especial e pao brioche.",
      priceCents: 3200,
      costCents: 1150,
      channels: ["pos", "qr", "delivery"],
      fiscalNcm: "21069090",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
    })
    .returning();
  const [beer] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: drinkCategory.id,
      name: "Chopp Pilsen 400ml",
      description: "Tirado na hora, gelado e com colarinho cremoso.",
      priceCents: 1400,
      costCents: 420,
      channels: ["pos", "qr"],
      fiscalNcm: "22030000",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
    })
    .returning();
  const [pizza] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: pizzaCategory.id,
      name: "Pizza meia lua",
      description: "Mussarela, tomate confit, manjericao e borda crocante.",
      priceCents: 5800,
      costCents: 1850,
      channels: ["pos", "qr", "delivery"],
      fiscalNcm: "19059090",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
    })
    .returning();
  const [brownie] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: dessertCategory.id,
      name: "Brownie da casa",
      description: "Chocolate intenso, sorvete de creme e calda quente.",
      priceCents: 2200,
      costCents: 620,
      channels: ["pos", "qr"],
      fiscalNcm: "18069000",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
    })
    .returning();
  const [soda] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: drinkCategory.id,
      name: "Soda italiana limao siciliano",
      description: "Xarope artesanal, agua com gas e hortela.",
      priceCents: 1800,
      costCents: 510,
      channels: ["pos", "qr"],
      fiscalNcm: "22021000",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
    })
    .returning();
  const [whiskyBottle] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: spiritsCategory.id,
      name: "Whisky Single Malt 1000ml",
      description: "Garrafa elegivel para Dose Club com 20 doses padrao de 50ml.",
      priceCents: 42000,
      costCents: 21000,
      isClubEligible: true,
      bottleVolumeMl: 1000,
      defaultDoseMl: 50,
      spiritType: "whisky",
      fiscalNcm: "22083020",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
      channels: ["pos"],
      metadata: { club: { defaultDoses: 20, custodyModel: "dose_balance" } },
    })
    .returning();

  if (!burger || !beer || !pizza || !brownie || !soda || !whiskyBottle) {
    throw new Error("Failed to seed products");
  }

  const [pointGroup] = await db
    .insert(modifierGroups)
    .values({
      tenantId: tenant.id,
      productId: burger.id,
      name: "Ponto da carne",
      minChoices: 1,
      maxChoices: 1,
      isRequired: true,
    })
    .returning();

  if (pointGroup) {
    await db.insert(modifierOptions).values([
      { tenantId: tenant.id, groupId: pointGroup.id, name: "Mal passado" },
      { tenantId: tenant.id, groupId: pointGroup.id, name: "Ao ponto" },
      { tenantId: tenant.id, groupId: pointGroup.id, name: "Bem passado" },
    ]);
  }

  const [stockLocation] = await db
    .insert(stockLocations)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: "Deposito",
      type: "storage",
    })
    .returning();

  const [meat] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Blend bovino",
      unit: "g",
      averageCostCents: 4,
      minQuantity: "3000",
    })
    .returning();
  const [cheese] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Queijo prato",
      unit: "g",
      averageCostCents: 3,
      minQuantity: "2000",
    })
    .returning();
  const [beerKeg] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Chopp Pilsen",
      unit: "ml",
      averageCostCents: 1,
      minQuantity: "30000",
    })
    .returning();
  const [deliveryPackaging] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Embalagem delivery",
      unit: "un",
      averageCostCents: 120,
      minQuantity: "60",
    })
    .returning();
  const [flour] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Farinha italiana",
      unit: "g",
      averageCostCents: 1,
      minQuantity: "5000",
    })
    .returning();
  const [singleMalt] = await db
    .insert(inventoryItems)
    .values({
      tenantId: tenant.id,
      name: "Whisky Single Malt",
      unit: "ml",
      averageCostCents: 21,
      minQuantity: "5000",
    })
    .returning();

  if (
    !stockLocation ||
    !meat ||
    !cheese ||
    !beerKeg ||
    !deliveryPackaging ||
    !flour ||
    !singleMalt
  ) {
    throw new Error("Failed to seed inventory");
  }

  await db.insert(stockMovements).values([
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: meat.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "2800",
      unitCostCents: 4,
      reason: "Seed demo - estoque critico para alertas",
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: cheese.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "4200",
      unitCostCents: 3,
      reason: "Seed demo",
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: beerKeg.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "90000",
      unitCostCents: 1,
      reason: "Seed demo",
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: deliveryPackaging.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "42",
      unitCostCents: 120,
      reason: "Seed demo - abaixo do minimo",
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: flour.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "15000",
      unitCostCents: 1,
      reason: "Seed demo",
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      inventoryItemId: singleMalt.id,
      stockLocationId: stockLocation.id,
      type: "initial_balance",
      quantity: "12000",
      unitCostCents: 21,
      reason: "Seed demo para Dose Club",
    },
  ]);

  const [burgerRecipe] = await db
    .insert(recipes)
    .values({
      tenantId: tenant.id,
      productId: burger.id,
      yieldQuantity: "1",
    })
    .returning();

  if (burgerRecipe) {
    await db.insert(recipeItems).values([
      {
        tenantId: tenant.id,
        recipeId: burgerRecipe.id,
        inventoryItemId: meat.id,
        quantity: "180",
        unit: "g",
      },
      {
        tenantId: tenant.id,
        recipeId: burgerRecipe.id,
        inventoryItemId: cheese.id,
        quantity: "45",
        unit: "g",
      },
    ]);
  }

  const [pizzaRecipe] = await db
    .insert(recipes)
    .values({
      tenantId: tenant.id,
      productId: pizza.id,
      yieldQuantity: "1",
      technicalLossRate: "0.0500",
    })
    .returning();

  if (pizzaRecipe) {
    await db.insert(recipeItems).values([
      {
        tenantId: tenant.id,
        recipeId: pizzaRecipe.id,
        inventoryItemId: flour.id,
        quantity: "260",
        unit: "g",
      },
      {
        tenantId: tenant.id,
        recipeId: pizzaRecipe.id,
        inventoryItemId: cheese.id,
        quantity: "180",
        unit: "g",
      },
    ]);
  }

  const [whiskyRecipe] = await db
    .insert(recipes)
    .values({
      tenantId: tenant.id,
      productId: whiskyBottle.id,
      yieldQuantity: "1",
    })
    .returning();

  if (whiskyRecipe) {
    await db.insert(recipeItems).values({
      tenantId: tenant.id,
      recipeId: whiskyRecipe.id,
      inventoryItemId: singleMalt.id,
      quantity: "1000",
      unit: "ml",
    });
  }

  await db.insert(integrationAccounts).values({
    tenantId: tenant.id,
    provider: "club_whisky",
    status: "disabled",
    config: {
      branchId: branch.id,
      scopes: [
        "branches:read",
        "products:read",
        "stock:read",
        "club_sales:write",
        "club_consumption:write",
        "customers:link",
      ],
      webhookUrl: null,
      webhookSecretRef: "CLUB_WHISKY_WEBHOOK_SECRET",
    },
    secretRef: "CLUB_WHISKY_API_KEY",
  });

  await db.insert(fiscalSettings).values({
    tenantId: tenant.id,
    branchId: branch.id,
    provider: "mock",
    status: "enabled",
    environment: "homologation",
    defaultModel: "nfce",
    legalName: "Bar Aurora Demo LTDA",
    tradeName: "Bar Aurora",
    document: "00000000000191",
    stateRegistration: "ISENTO",
    taxRegime: "simples_nacional",
    uf: "SP",
    cityCode: "3550308",
    cityName: "Sao Paulo",
    series: "1",
    nextNumber: 1,
    certificateSecretRef: "FISCAL_CERTIFICATE_A1",
    cscSecretRef: "FISCAL_CSC_TOKEN",
    config: { mock: true },
  });

  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, owner.id), eq(userRoles.roleId, ownerRole.id)))
    .limit(1);

  return {
    tenant: tenant.slug,
    branch: branch.name,
    adminEmail: owner.email,
    adminPassword: "Demo@12345",
    platformEmail: "owner@giromesa.local",
    platformPassword: "Platform@12345",
    alreadyHadRole: Boolean(existingRole),
  };
}

async function upsertPlatformOwner() {
  const passwordHash = await argon2.hash(`Platform@12345${passwordPepper}`, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, "owner@giromesa.local"), eq(users.isPlatformUser, true)))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        name: "Dono GiroMesa",
        passwordHash,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return existing;
  }

  const [owner] = await db
    .insert(users)
    .values({
      tenantId: null,
      email: "owner@giromesa.local",
      name: "Dono GiroMesa",
      passwordHash,
      isPlatformUser: true,
    })
    .returning();

  return owner;
}

Promise.all([upsertDemo(), upsertPlatformOwner()])
  .then((result) => {
    console.log("Seed complete", result);
  })
  .finally(async () => {
    await pool.end();
  });
