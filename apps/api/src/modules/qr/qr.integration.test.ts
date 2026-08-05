import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  categories,
  commercialAttributionDaily,
  diningTables,
  guestExperienceConfigs,
  operationalEvents,
  operationIdempotency,
  orderItems,
  orders,
  payments,
  products,
  publicRequestIdempotency,
  qrBranchSettings,
  qrGuestAccessRequests,
  qrGuestSessions,
  serviceRequests,
  tableServiceSessions,
  tenants,
  users,
} from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import type { OrdersService } from "../pos/orders.service";
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
  const autoSendQrOrder = vi.fn(async () => ({ status: "sent_to_kitchen" }));
  const service = new QrService(
    { db } as unknown as DatabaseService,
    { autoSendQrOrder } as unknown as OrdersService,
  );
  let tenantId = "";
  let branchId = "";
  let userId = "";
  let tableId = "";
  let productId = "";
  let alcoholicProductId = "";
  let categoryId = "";

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
    const [category] = await db
      .insert(categories)
      .values({ tenantId, branchId, name: "Destaques", isActive: true })
      .returning();
    if (!category) throw new Error("category fixture failed");
    categoryId = category.id;
    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        categoryId,
        name: "Produto QR",
        priceCents: 2500,
        channels: ["pos", "qr"],
      })
      .returning();
    if (!product) throw new Error("product fixture failed");
    productId = product.id;
    const [alcoholicProduct] = await db
      .insert(products)
      .values({
        tenantId,
        categoryId,
        name: "Whisky QR",
        priceCents: 4200,
        channels: ["pos", "qr"],
        isAlcoholic: true,
      })
      .returning();
    if (!alcoholicProduct) throw new Error("alcoholic product fixture failed");
    alcoholicProductId = alcoholicProduct.id;
    await db.insert(orders).values({
      tenantId,
      branchId,
      tableId,
      channel: "pos",
      status: "opened",
      openedAt: new Date(),
    });
    await service.updateSettings(testContext("qr-settings"), {
      mode: "self_service",
      presenceMethods: ["code"],
      reviewBeforeKds: false,
    });
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(serviceRequests).where(eq(serviceRequests.tenantId, tenantId));
      await db.delete(qrGuestAccessRequests).where(eq(qrGuestAccessRequests.tenantId, tenantId));
      await db
        .delete(commercialAttributionDaily)
        .where(eq(commercialAttributionDaily.tenantId, tenantId));
      await db
        .delete(publicRequestIdempotency)
        .where(eq(publicRequestIdempotency.tenantId, tenantId));
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
      await db.delete(operationIdempotency).where(eq(operationIdempotency.tenantId, tenantId));
      await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
      await db.delete(payments).where(eq(payments.tenantId, tenantId));
      await db.delete(qrGuestSessions).where(eq(qrGuestSessions.tenantId, tenantId));
      await db.delete(tableServiceSessions).where(eq(tableServiceSessions.tenantId, tenantId));
      await db.delete(orders).where(eq(orders.tenantId, tenantId));
      await db.delete(products).where(eq(products.tenantId, tenantId));
      await db.delete(categories).where(eq(categories.tenantId, tenantId));
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
    const context = testContext("qr-integration");
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const oldToken = tokenFromUrl(table.publicUrl);
    const before = await service.getPublicContext(oldToken);
    expect(before.table.id).toBe(tableId);
    expect(before.table.active).toBe(true);
    const guestToken = await activateGuest(context, oldToken);

    const input = { guestLabel: "assento 3", items: [{ productId, quantity: 2 }] };
    const first = await service.createPublicOrder(oldToken, "qr-order-key-0001", input, guestToken);
    const replay = await service.createPublicOrder(
      oldToken,
      "qr-order-key-0001",
      input,
      guestToken,
    );
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ dispatchStatus: "sent" });
    expect(autoSendQrOrder).toHaveBeenCalledTimes(2);

    const rows = await db.select().from(orderItems).where(eq(orderItems.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalCents).toBe(5000);
    await expect(service.getPublicOrder(oldToken, guestToken)).resolves.toMatchObject({
      order: { guestLabel: "assento 3" },
    });

    const rotated = await service.rotate(context, tableId);
    await expect(service.getPublicContext(oldToken)).rejects.toThrow(/invalid|rotated/i);
    const newToken = tokenFromUrl(rotated.publicUrl);
    await expect(service.getPublicContext(newToken)).resolves.toMatchObject({
      table: { id: tableId },
    });
  });

  it("recovers an automatic KDS dispatch on replay without duplicating the QR item", async () => {
    const context = testContext("qr-dispatch-recovery");
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);
    const guestToken = await activateGuest(context, token);
    const input = { items: [{ productId, quantity: 1 }] };
    autoSendQrOrder.mockRejectedValueOnce(new Error("temporary KDS outage"));

    await expect(
      service.createPublicOrder(token, "qr-dispatch-recovery-0001", input, guestToken),
    ).resolves.toMatchObject({ dispatchStatus: "attention" });
    await expect(
      service.createPublicOrder(token, "qr-dispatch-recovery-0001", input, guestToken),
    ).resolves.toMatchObject({ dispatchStatus: "sent" });

    const matchingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.tenantId, tenantId));
    expect(matchingItems.filter((item) => Number(item.quantity) === 1)).toHaveLength(1);
  });

  it("requires a current server-signed age confirmation for alcoholic QR items", async () => {
    const context = testContext("qr-age-confirmation");
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);
    const guestToken = await activateGuest(context, token);
    const alcoholicInput = { items: [{ productId: alcoholicProductId, quantity: 1 }] };

    await expect(
      service.createPublicOrder(token, "qr-age-missing-0001", alcoholicInput, guestToken),
    ).rejects.toThrow(/age confirmation is required/i);

    const confirmation = await service.createAgeConfirmation(token, guestToken);
    await expect(
      service.createPublicOrder(
        token,
        "qr-age-tampered-0002",
        {
          ...alcoholicInput,
          ageConfirmationToken: `${confirmation.token}tampered`,
        },
        guestToken,
      ),
    ).rejects.toThrow(/invalid or expired/i);

    await expect(
      service.createPublicOrder(
        token,
        "qr-age-valid-0003",
        {
          ...alcoholicInput,
          ageConfirmationToken: confirmation.token,
        },
        guestToken,
      ),
    ).resolves.toMatchObject({ itemCount: 1 });

    await expect(
      service.createPublicOrder(
        token,
        "qr-age-soft-drink-0004",
        {
          items: [{ productId, quantity: 1 }],
        },
        guestToken,
      ),
    ).resolves.toMatchObject({ itemCount: 1 });
  });

  it("creates an operational service request and enforces its transition", async () => {
    const context = testContext("qr-request-integration");
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);
    const guestToken = await activateGuest(context, token);
    const created = await service.createServiceRequest(
      token,
      "qr-call-key-0001",
      { type: "call_waiter" },
      guestToken,
    );
    const replay = await service.createServiceRequest(
      token,
      "qr-call-key-0001",
      { type: "call_waiter" },
      guestToken,
    );
    expect(replay).toEqual(created);
    await expect(service.getPublicServiceRequest(token, created.id as string)).rejects.toThrow(
      /mesa|expirou/i,
    );
    await expect(
      service.getPublicServiceRequest(token, created.id as string, guestToken),
    ).resolves.toMatchObject({
      id: created.id,
      status: "pending",
      type: "call_waiter",
    });
    const publicStatus = await service.getPublicServiceRequest(
      token,
      created.id as string,
      guestToken,
    );
    expect(publicStatus).not.toHaveProperty("tenantId");
    expect(publicStatus).not.toHaveProperty("tableId");
    await db
      .update(serviceRequests)
      .set({ createdAt: new Date(Date.now() - 181_000) })
      .where(eq(serviceRequests.id, created.id as string));
    await expect(service.listServiceRequests(context, "pending")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, attention: "escalated" })]),
    );
    await expect(service.acknowledge(context, created.id as string)).resolves.toMatchObject({
      status: "acknowledged",
    });
    await expect(service.resolve(context, created.id as string)).resolves.toMatchObject({
      status: "resolved",
    });
  });

  it("previews the guest experience without persisting a revision or audit", async () => {
    const context = testContext("qr-preview-integration");
    const revisionsBefore = await db
      .select({ id: guestExperienceConfigs.id })
      .from(guestExperienceConfigs)
      .where(eq(guestExperienceConfigs.tenantId, tenantId));
    const auditsBefore = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId));

    await expect(
      service.previewExperience(context, {
        template: "minimal",
        primaryColor: "#0f766e",
        welcomeMessage: "Somente uma prévia",
      }),
    ).resolves.toMatchObject({
      preview: true,
      persisted: false,
      branchId,
      config: {
        template: "minimal",
        primaryColor: "#0f766e",
        welcomeMessage: "Somente uma prévia",
      },
    });

    const revisionsAfter = await db
      .select({ id: guestExperienceConfigs.id })
      .from(guestExperienceConfigs)
      .where(eq(guestExperienceConfigs.tenantId, tenantId));
    const auditsAfter = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId));
    expect(revisionsAfter).toEqual(revisionsBefore);
    expect(auditsAfter).toEqual(auditsBefore);
  });

  it("persists and returns split and payment intents without creating payments", async () => {
    const context = testContext("qr-structured-requests-integration");
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);
    const guestToken = await activateGuest(context, token);
    const paymentsBefore = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.tenantId, tenantId));

    const split = await service.createServiceRequest(
      token,
      "qr-split-key-0001",
      { type: "split_intent", split: { mode: "equal", people: 3 } },
      guestToken,
    );
    await expect(
      service.createServiceRequest(
        token,
        "qr-split-key-0001",
        { type: "split_intent", split: { mode: "equal", people: 3 } },
        guestToken,
      ),
    ).resolves.toEqual(split);
    await expect(
      service.createServiceRequest(
        token,
        "qr-split-key-0001",
        { type: "split_intent", split: { mode: "equal", people: 4 } },
        guestToken,
      ),
    ).rejects.toThrow(/idempotency|payload|different/i);
    await expect(
      service.getPublicServiceRequest(token, split.id as string, guestToken),
    ).resolves.toMatchObject({
      id: split.id,
      type: "split_intent",
      metadata: { split: { mode: "equal", people: 3 } },
    });

    const payment = await service.createServiceRequest(
      token,
      "qr-payment-key-0001",
      { type: "payment_preference", payment: { method: "pix" } },
      guestToken,
    );
    await expect(
      service.getPublicServiceRequest(token, payment.id as string, guestToken),
    ).resolves.toMatchObject({
      id: payment.id,
      type: "payment_preference",
      metadata: { payment: { method: "pix" } },
    });

    const paymentsAfter = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.tenantId, tenantId));
    expect(paymentsAfter).toEqual(paymentsBefore);
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
      coverUrl: "/uploads/cover.webp",
      highlights: ["Happy hour", "Música ao vivo"],
      campaignMessage: "Rodada dupla até 20h",
      houseInfo: "Wi-Fi disponível",
      language: "en",
      categoryLabels: { [categoryId]: "House picks" },
      recommendedProductIds: [productId],
      serviceRequestReasons: ["More napkins", "Help with the menu"],
    });
    expect(draft.status).toBe("draft");
    const published = await service.publishExperience(context, draft.id);
    expect(published).toMatchObject({ status: "published", version: draft.version });
    const publicContext = await service.getPublicContext(tokenFromUrl(tokenBefore));
    expect(publicContext.qrSettings).toMatchObject({
      template: "premium",
      primaryColor: "#123456",
      welcomeMessage: "Bem-vindo",
      coverUrl: "/uploads/cover.webp",
      highlights: ["Happy hour", "Música ao vivo"],
      language: "en",
      serviceRequestReasons: ["More napkins", "Help with the menu"],
    });
    expect(publicContext.categories).toContainEqual(
      expect.objectContaining({
        id: categoryId,
        name: "House picks",
      }),
    );
    expect(publicContext.products).toContainEqual(
      expect.objectContaining({
        id: productId,
        recommended: true,
      }),
    );
    const secondDraft = await service.createExperienceDraft(context, {
      template: "minimal",
      primaryColor: "#654321",
      welcomeMessage: "Outra versao",
    });
    const secondPublished = await service.publishExperience(context, secondDraft.id);
    const restored = await service.rollbackExperience(context, published.id);
    expect(restored).toMatchObject({
      status: "published",
      version: expect.any(Number),
    });
    expect(restored.version).toBeGreaterThan(secondPublished.version);
    await expect(service.getPublicContext(tokenFromUrl(tokenBefore))).resolves.toMatchObject({
      qrSettings: {
        template: "premium",
        primaryColor: "#123456",
        welcomeMessage: "Bem-vindo",
      },
    });
    const scheduledDraft = await service.createExperienceDraft(context, {
      template: "doseclub",
      welcomeMessage: "Agendado",
    });
    const scheduledAt = new Date(Date.now() + 60_000);
    await expect(
      service.scheduleExperience(context, scheduledDraft.id, scheduledAt),
    ).resolves.toMatchObject({
      status: "draft",
      scheduledAt: scheduledAt.toISOString(),
    });
    await expect(
      service.scheduleExperience(context, scheduledDraft.id, new Date(Date.now() - 60_000)),
    ).rejects.toThrow("future");
    await db
      .update(guestExperienceConfigs)
      .set({ scheduledAt: new Date(Date.now() - 1_000) })
      .where(eq(guestExperienceConfigs.id, scheduledDraft.id));
    await expect(service.getPublicContext(tokenFromUrl(tokenBefore))).resolves.toMatchObject({
      qrSettings: {
        template: "doseclub",
        welcomeMessage: "Agendado",
      },
    });
    await expect(service.getExperience(context)).resolves.toMatchObject({
      published: { version: scheduledDraft.version, status: "published", scheduledAt: null },
    });
    const [tableAfter] = await service.listTables(context);
    expect(tableAfter?.publicUrl).toBe(tokenBefore);
  });

  it("stores commercial origin as a daily aggregate without table, order, or personal data", async () => {
    const context = {
      tenantId,
      branchId,
      userId,
      requestId: "qr-attribution-integration",
      permissions: ["tenant:manage", "pos:operate"],
      isDemo: false,
    };
    const [table] = await service.listTables(context);
    if (!table) throw new Error("QR table not listed");
    const token = tokenFromUrl(table.publicUrl);

    await service.recordCommercialAttribution(token, "giromesa");
    await service.recordCommercialAttribution(token, "giromesa");

    const rows = await db
      .select()
      .from(commercialAttributionDaily)
      .where(eq(commercialAttributionDaily.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId,
      branchId,
      source: "qr_organic",
      destination: "giromesa",
      campaign: "organic_attribution",
      visits: 2,
    });
    expect(rows[0]).not.toHaveProperty("tableId");
    expect(rows[0]).not.toHaveProperty("orderId");
    expect(rows[0]).not.toHaveProperty("userId");
  });

  function testContext(requestId: string) {
    return {
      tenantId,
      branchId,
      userId,
      requestId,
      permissions: ["tenant:manage", "pos:operate"],
      isDemo: false,
    };
  }

  async function activateGuest(context: ReturnType<typeof testContext>, token: string) {
    const activation = await service.activateTableService(context, tableId);
    return (await service.validatePresenceCode(token, activation.code)).token;
  }
});

function tokenFromUrl(value: string) {
  const segment = new URL(value).pathname.split("/").filter(Boolean).at(-1);
  if (!segment) throw new Error("token missing from public URL");
  return decodeURIComponent(segment);
}
