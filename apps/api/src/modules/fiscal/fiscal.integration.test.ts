import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  categories,
  fiscalDocuments,
  fiscalSettings,
  orderItems,
  orders,
  payments,
  products,
  tenants,
} from "@giromesa/db";
import { NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { FiscalService } from "./fiscal.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(fiscalDocuments).where(eq(fiscalDocuments.tenantId, tenantId));
  await db.delete(fiscalSettings).where(eq(fiscalSettings.tenantId, tenantId));
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(categories).where(eq(categories.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function createFiscalFixture(db: Db, name: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      slug: `fiscal-${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
      status: "active",
    })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create fiscal test tenant");
  }

  const [branch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Matriz" })
    .returning();
  if (!branch) {
    throw new Error("Failed to create fiscal test branch");
  }

  const [category] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Bebidas" })
    .returning();
  if (!category) {
    throw new Error("Failed to create fiscal test category");
  }

  const [product] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: category.id,
      name: `${name} Chopp`,
      priceCents: 1800,
      costCents: 600,
      fiscalNcm: "22030000",
      fiscalCfop: "5102",
      fiscalOrigin: "0",
      fiscalCsosn: "102",
      channels: ["pos"],
    })
    .returning();
  if (!product) {
    throw new Error("Failed to create fiscal test product");
  }

  const [order] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      channel: "counter",
      status: "paid",
      subtotalCents: 1800,
      totalCents: 1800,
    })
    .returning();
  if (!order) {
    throw new Error("Failed to create fiscal test order");
  }

  await db.insert(orderItems).values({
    tenantId: tenant.id,
    orderId: order.id,
    productId: product.id,
    nameSnapshot: product.name,
    quantity: "1",
    unitPriceCents: 1800,
    totalCents: 1800,
    status: "served",
  });

  await db.insert(payments).values({
    tenantId: tenant.id,
    orderId: order.id,
    provider: "manual",
    method: "pix_manual",
    status: "confirmed",
    amountCents: 1800,
    idempotencyKey: `${name}-fiscal-payment`,
    confirmedAt: new Date(),
  });

  await db.insert(fiscalSettings).values({
    tenantId: tenant.id,
    branchId: branch.id,
    provider: "focus_nfe",
    status: "enabled",
    environment: "homologation",
    defaultModel: "nfce",
    legalName: `${name} LTDA`,
    document: "00000000000191",
    taxRegime: "simples_nacional",
    uf: "SP",
    cityCode: "3550308",
    cityName: "Sao Paulo",
    series: "1",
    nextNumber: 1,
    certificateSecretRef: "FISCAL_CERTIFICATE_A1",
    cscSecretRef: "FISCAL_CSC_TOKEN",
    config: { test: true },
  });

  return { tenant, branch, order };
}

runIntegration("fiscal document database behavior", () => {
  let pool: Pool;
  let db: Db;
  let fiscalService: FiscalService;
  let tenantA: Awaited<ReturnType<typeof createFiscalFixture>>;
  let tenantB: Awaited<ReturnType<typeof createFiscalFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    fiscalService = new FiscalService({ db } as DatabaseService);
    tenantA = await createFiscalFixture(db, "Tenant A");
    tenantB = await createFiscalFixture(db, "Tenant B");
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

  it("creates a pending fiscal document and keeps issue idempotent per order and model", async () => {
    const context = {
      tenantId: tenantA.tenant.id,
      branchId: tenantA.branch.id,
      requestId: "fiscal-it-1",
      permissions: ["fiscal:read", "fiscal:manage"],
    };

    const first = await fiscalService.createPendingOrderDocument(context, tenantA.order.id);
    const duplicate = await fiscalService.createPendingOrderDocument(context, tenantA.order.id);

    expect(first.id).toBe(duplicate.id);
    expect(first.status).toBe("pending");
    expect(first.number).toBe(1);

    const documents = await fiscalService.listDocuments(context, { branchId: tenantA.branch.id });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.orderId).toBe(tenantA.order.id);

    const [storedDocument] = await db
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, first.id))
      .limit(1);

    const payload = storedDocument?.payload as {
      focusNfePayload?: {
        cnpj_emitente?: string;
        items?: Array<{ ncm?: string; cfop?: string }>;
        formas_pagamento?: Array<{ forma_pagamento?: string; valor_pagamento?: string }>;
      };
    };

    expect(payload.focusNfePayload?.cnpj_emitente).toBe("00000000000191");
    expect(payload.focusNfePayload?.items?.[0]?.ncm).toBe("22030000");
    expect(payload.focusNfePayload?.items?.[0]?.cfop).toBe("5102");
    expect(payload.focusNfePayload?.formas_pagamento?.[0]?.forma_pagamento).toBe("17");
    expect(payload.focusNfePayload?.formas_pagamento?.[0]?.valor_pagamento).toBe("18.00");
  });

  it("does not allow one tenant to issue fiscal documents for another tenant order", async () => {
    await expect(
      fiscalService.createPendingOrderDocument(
        {
          tenantId: tenantA.tenant.id,
          branchId: tenantA.branch.id,
          requestId: "fiscal-it-cross-tenant",
          permissions: ["fiscal:read", "fiscal:manage"],
        },
        tenantB.order.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
