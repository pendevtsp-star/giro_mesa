import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  diningTables,
  guestExperienceConfigs,
  operationalEvents,
  orderItems,
  orders,
  products,
  publicRequestIdempotency,
  qrBranchSettings,
  serviceRequests,
  tenants,
  users,
} from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { QrService } from "./qr.service";

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

runIntegration("secure table QR", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const service = new QrService({ db } as unknown as DatabaseService);
  let tenantId = "";
  let branchId = "";
  let userId = "";
  let tableId = "";
  let productId = "";

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "QR Integration", slug: `qr-integration-${stamp}`, status: "active" })
      .returning();
    if (!tenant) throw new Error("tenant fixture failed");
    tenantId = tenant.id;
    const [branch] = await db.insert(branches).values({ tenantId, name: "Matriz" }).returning();
    if (!branch) throw new Error("branch fixture failed");
    branchId = branch.id;
    const [user] = await db
      .insert(users)
      .values({ tenantId, email: `qr-${stamp}@example.com`, name: "QR Owner" })
      .returning();
    if (!user) throw new Error("user fixture failed");
    userId = user.id;
    const [table] = await db
      .insert(diningTables)
      .values({
        tenantId,
        branchId,
        code: "Q01",
        name: "Mesa QR",
        status: "occupied",
      })
      .returning();
    if (!table) throw new Error("table fixture failed");
    tableId = table.id;
    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        name: "Produto QR",
        priceCents: 2500,
        channels: ["pos", "qr"],
      })
      .returning();
    if (!product) throw new Error("product fixture failed");
    productId = product.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(serviceRequests).where(eq(serviceRequests.tenantId, tenantId));
      await db
        .delete(publicRequestIdempotency)
        .where(eq(publicRequestIdempotency.tenantId, tenantId));
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
      await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
      await db.delete(orders).where(eq(orders.tenantId, tenantId));
      await db.delete(products).where(eq(products.tenantId, tenantId));
      await db.delete(qrBranchSettings).where(eq(qrBranchSettings.tenantId, tenantId));
      await db.delete(guestExperienceConfigs).where(eq(guestExperienceConfigs.tenantId, tenantId));
      await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(branches).where(eq(branches.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await pool.end();
  });

  it("replays duplicate orders and invalidates the old token after rotation", async () => {
    const context = {
      tenantId,
      branchId,
      userId,
      requestId: "qr-integration",
      permissions: ["tenant:manage", "pos:operate"],
      isDemo: false,
    };
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const oldToken = tokenFromUrl(table.publicUrl);
    const before = await service.getPublicContext(oldToken);
    expect(before.table.id).toBe(tableId);
    expect(before.table.active).toBe(true);

    const input = { items: [{ productId, quantity: 2 }] };
    const first = await service.createPublicOrder(oldToken, "qr-order-key-0001", input);
    const replay = await service.createPublicOrder(oldToken, "qr-order-key-0001", input);
    expect(replay).toEqual(first);

    const rows = await db.select().from(orderItems).where(eq(orderItems.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalCents).toBe(5000);

    const rotated = await service.rotate(context, tableId);
    await expect(service.getPublicContext(oldToken)).rejects.toThrow(/invalid|rotated/i);
    const newToken = tokenFromUrl(rotated.publicUrl);
    await expect(service.getPublicContext(newToken)).resolves.toMatchObject({
      table: { id: tableId },
    });
  });

  it("creates an operational service request and enforces its transition", async () => {
    const context = {
      tenantId,
      branchId,
      userId,
      requestId: "qr-request-integration",
      permissions: ["tenant:manage", "pos:operate"],
      isDemo: false,
    };
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);
    const created = await service.createServiceRequest(token, "qr-call-key-0001", {
      type: "call_waiter",
    });
    const replay = await service.createServiceRequest(token, "qr-call-key-0001", {
      type: "call_waiter",
    });
    expect(replay).toEqual(created);
    await expect(
      service.getPublicServiceRequest(token, created.id as string),
    ).resolves.toMatchObject({
      id: created.id,
      status: "pending",
      type: "call_waiter",
    });
    const publicStatus = await service.getPublicServiceRequest(token, created.id as string);
    expect(publicStatus).not.toHaveProperty("tenantId");
    expect(publicStatus).not.toHaveProperty("tableId");
    await expect(service.acknowledge(context, created.id as string)).resolves.toMatchObject({
      status: "acknowledged",
    });
    await expect(service.resolve(context, created.id as string)).resolves.toMatchObject({
      status: "resolved",
    });
  });

  it("publishes a versioned guest experience without changing the QR token", async () => {
    const context = {
      tenantId,
      branchId,
      userId,
      requestId: "qr-experience-integration",
      permissions: ["tenant:manage", "pos:operate"],
      isDemo: false,
    };
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const tokenBefore = table.publicUrl;
    const draft = await service.createExperienceDraft(context, {
      template: "premium",
      primaryColor: "#123456",
      welcomeMessage: "Bem-vindo",
    });
    expect(draft.status).toBe("draft");
    const published = await service.publishExperience(context, draft.id);
    expect(published).toMatchObject({ status: "published", version: draft.version });
    const publicContext = await service.getPublicContext(tokenFromUrl(tokenBefore));
    expect(publicContext.qrSettings).toMatchObject({
      template: "premium",
      primaryColor: "#123456",
      welcomeMessage: "Bem-vindo",
    });
    const [tableAfter] = await service.listTables(context);
    expect(tableAfter?.publicUrl).toBe(tokenBefore);
  });
});

function tokenFromUrl(value: string) {
  const segment = new URL(value).pathname.split("/").filter(Boolean).at(-1);
  if (!segment) throw new Error("token missing from public URL");
  return decodeURIComponent(segment);
}
