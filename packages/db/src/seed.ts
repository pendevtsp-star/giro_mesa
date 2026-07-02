import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  branches,
  categories,
  diningTables,
  inventoryItems,
  kdsStations,
  modifierGroups,
  modifierOptions,
  plans,
  products,
  recipeItems,
  recipes,
  roles,
  stockLocations,
  stockMovements,
  tenants,
  userRoles,
  users,
} from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa";
const passwordPepper = process.env.PASSWORD_PEPPER ?? "local-development-password-pepper";

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

async function upsertDemo() {
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
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: { name: "Bar Aurora Demo", status: "trial" },
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
        "kds:operate",
        "cash:manage",
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

  for (const code of ["M01", "M02", "M03", "M04"]) {
    await db.insert(diningTables).values({
      tenantId: tenant.id,
      branchId: branch.id,
      code,
      name: `Mesa ${code.replace("M", "")}`,
      seats: 4,
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

  if (!foodCategory || !drinkCategory || !kitchen || !bar) {
    throw new Error("Failed to seed catalog base");
  }

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
    })
    .returning();

  if (!burger || !beer) {
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

  if (!stockLocation || !meat) {
    throw new Error("Failed to seed inventory");
  }

  await db.insert(stockMovements).values({
    tenantId: tenant.id,
    branchId: branch.id,
    inventoryItemId: meat.id,
    stockLocationId: stockLocation.id,
    type: "initial_balance",
    quantity: "10000",
    unitCostCents: 4,
    reason: "Seed demo",
  });

  const [burgerRecipe] = await db
    .insert(recipes)
    .values({
      tenantId: tenant.id,
      productId: burger.id,
      yieldQuantity: "1",
    })
    .returning();

  if (burgerRecipe) {
    await db.insert(recipeItems).values({
      tenantId: tenant.id,
      recipeId: burgerRecipe.id,
      inventoryItemId: meat.id,
      quantity: "180",
      unit: "g",
    });
  }

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
    alreadyHadRole: Boolean(existingRole),
  };
}

upsertDemo()
  .then((result) => {
    console.log("Seed complete", result);
  })
  .finally(async () => {
    await pool.end();
  });
