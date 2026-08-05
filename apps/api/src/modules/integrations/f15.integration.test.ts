import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  deliveryOrders,
  integrationAccounts,
  operationalEvents,
  orders,
  tenants,
  users,
  webhookEvents,
} from "@giromesa/db";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailSuppressionKey, sendEmail } from "../../common/email-delivery";
import type { DatabaseService } from "../database/database.service";
import { DeliveryService } from "../delivery/delivery.service";
import { PlatformService } from "../platform/platform.service";
import { ClubWhiskyService } from "./club-whisky.service";
import type { IfoodProvider } from "./ifood-provider";
import { WEBHOOK_PROCESSING_LEASE_MS, WebhooksService } from "./webhooks.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa";

runIntegration("F15 persistence and support enforcement", () => {
  let pool: Pool;
  let db: Db;
  let webhooks: WebhooksService;
  let platform: PlatformService;
  let delivery: DeliveryService;
  let clubWhisky: ClubWhiskyService;
  const tenantIds: string[] = [];

  beforeAll(() => {
    process.env.PASSWORD_PEPPER = "synthetic-f15-pepper";
    process.env.EMAIL_PROVIDER = "mock";
    process.env.NODE_ENV = "test";
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    const database = { db } as DatabaseService;
    webhooks = new WebhooksService(database, {} as IfoodProvider);
    platform = new PlatformService(database);
    delivery = new DeliveryService(database);
    clubWhisky = new ClubWhiskyService(database);
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(webhookEvents).where(eq(webhookEvents.tenantId, tenantId));
      await db.delete(deliveryOrders).where(eq(deliveryOrders.tenantId, tenantId));
      await db.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
      await db.delete(orders).where(eq(orders.tenantId, tenantId));
      await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(branches).where(eq(branches.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await pool.end();
  });

  it("persists, deduplicates, recovers and blocks outbound for a suppressed recipient", async () => {
    const tenant = await createTenant("resend");
    const payload = {
      id: "evt-bounce",
      type: "email.bounced",
      data: { to: "synthetic@example.test" },
    };
    const first = await webhooks.accept({
      provider: "resend",
      externalEventId: "evt-bounce",
      tenantId: tenant.id,
      payload,
    });
    const duplicate = await webhooks.accept({
      provider: "resend",
      externalEventId: "evt-bounce",
      tenantId: tenant.id,
      payload,
    });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    const [stored] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, "evt-bounce"));
    expect(stored?.status).toBe("suppressed");
    expect(stored?.payload).not.toHaveProperty("recipient");
    expect(JSON.stringify(stored?.payload)).not.toContain("synthetic@example.test");
    await expect(
      sendEmail({ db } as DatabaseService, {
        tenantId: tenant.id,
        to: "synthetic@example.test",
        subject: "test",
        text: "test",
        html: "<p>test</p>",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_RECIPIENT_SUPPRESSED" });

    await db.insert(webhookEvents).values({
      provider: "resend",
      externalEventId: "evt-retry",
      tenantId: tenant.id,
      payload: { id: "evt-retry", type: "email.complained", data: { to: "retry@example.test" } },
      status: "failed",
    });
    await webhooks.accept({
      provider: "resend",
      externalEventId: "evt-retry",
      tenantId: tenant.id,
      payload: { id: "changed", type: "email.delivered" },
    });
    const [recovered] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, "evt-retry"));
    expect(recovered?.status).toBe("suppressed");

    await db.insert(webhookEvents).values({
      provider: "resend",
      externalEventId: "evt-abandoned-processing",
      tenantId: tenant.id,
      payload: {
        eventType: "email.bounced",
        status: "suppressed",
        scope: "recipient",
        suppressionKey: emailSuppressionKey("crash@example.test"),
      },
      status: "processing",
      updatedAt: new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS - 1_000),
    });
    const reclaimed = await webhooks.accept({
      provider: "resend",
      externalEventId: "evt-abandoned-processing",
      tenantId: tenant.id,
      payload: { id: "ignored-redelivery", type: "email.delivered" },
    });
    expect(reclaimed.duplicate).toBe(true);
    const abandonedRows = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, "evt-abandoned-processing"));
    expect(abandonedRows).toHaveLength(1);
    expect(abandonedRows[0]?.status).toBe("suppressed");
  });

  it("enforces scoped grants, expiry, revocation, isolation and atomic audit", async () => {
    const tenant = await createTenant("support");
    const [branch] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: "Matriz", isActive: true })
      .returning();
    if (!branch) throw new Error("branch fixture failed");
    const context = {
      tenantId: "platform",
      userId: "actor-a",
      requestId: "support-ok",
      permissions: ["platform:manage"],
    };
    const base = {
      priority: "normal" as const,
      supportStatus: "queued" as const,
      commercialNotes: "",
      slaTier: "standard" as const,
    };
    const response = await platform.updateTenantSupport(context, tenant.id, {
      ...base,
      accessMode: "elevated",
      elevationReason: "Controlled diagnostic action",
      elevationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      accessBranchId: branch.id,
      accessResource: "operations",
      accessActions: ["read", "mutate"],
    });
    expect(response.support.access).toMatchObject({
      mode: "elevated",
      branchId: branch.id,
      resource: "operations",
    });
    await expect(
      platform.getSupportResource(context, tenant.id, branch.id, "operations"),
    ).resolves.toMatchObject({ actorId: "actor-a", tenantId: tenant.id });
    await expect(
      platform.getSupportResource(context, tenant.id, null, "operations"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      platform.getSupportResource(
        { ...context, userId: "actor-b" },
        tenant.id,
        branch.id,
        "operations",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      platform.recordSupportDiagnostic(context, tenant.id, {
        branchId: branch.id,
        resource: "operations",
        summary: "Synthetic diagnostic result",
      }),
    ).resolves.toMatchObject({ actorId: "actor-a" });
    await platform.revokeSupportGrant(
      context,
      tenant.id,
      response.support.access.grantId as string,
    );
    await expect(
      platform.getSupportResource(context, tenant.id, branch.id, "operations"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const before = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenant.id));
    await expect(
      platform.updateTenantSupport({ ...context, requestId: "x".repeat(121) }, tenant.id, {
        ...base,
        accessMode: "read_only",
        accessBranchId: branch.id,
        accessResource: "audit",
        accessActions: ["read"],
      }),
    ).rejects.toThrow();
    const after = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenant.id));
    expect(after[0]?.settings).toEqual(before[0]?.settings);
  });

  it("requires and deduplicates the manual iFood external correlation key", async () => {
    const tenant = await createTenant("ifood");
    const [branch] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: "Delivery", isActive: true })
      .returning();
    if (!branch) throw new Error("branch fixture failed");
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `f15-ifood-${Date.now()}@test.local`,
        name: "Delivery operator",
      })
      .returning();
    if (!user) throw new Error("user fixture failed");
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: tenant.id,
        branchId: branch.id,
        channel: "delivery",
        status: "opened",
        openedAt: new Date(),
      })
      .returning();
    if (!order) throw new Error("order fixture failed");
    const context = {
      tenantId: tenant.id,
      userId: user.id,
      requestId: "ifood-correlation",
      permissions: ["delivery:manage"],
    };
    await expect(
      delivery.createDelivery(context, { orderId: order.id, channel: "ifood" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const first = await delivery.createDelivery(context, {
      orderId: order.id,
      channel: "ifood",
      externalCorrelationKey: "IFOOD-ORDER-9001",
    });
    const duplicate = await delivery.createDelivery(context, {
      orderId: order.id,
      channel: "ifood",
      externalCorrelationKey: "IFOOD-ORDER-9001",
    });
    expect(duplicate).toMatchObject({ id: first.id, duplicate: true });
    const stored = await db
      .select({ id: deliveryOrders.id })
      .from(deliveryOrders)
      .where(and(eq(deliveryOrders.tenantId, tenant.id), eq(deliveryOrders.channel, "ifood")));
    expect(stored).toHaveLength(1);
  });

  it("versions the Dose Club lifecycle through active, degraded, recovered and revoked", async () => {
    const tenant = await createTenant("dose-lifecycle");
    const [branch] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: "Dose", isActive: true })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `f15-dose-${Date.now()}@test.local`,
        name: "Dose operator",
      })
      .returning();
    if (!branch || !user) throw new Error("Dose lifecycle fixture failed");
    const context = {
      tenantId: tenant.id,
      branchId: branch.id,
      userId: user.id,
      requestId: "dose-lifecycle",
      permissions: ["tenant:manage"],
    };
    const configured = await clubWhisky.ensureIntegrationAccount(context, {
      branchId: branch.id,
      remoteClientId: "dose-lifecycle-client",
      webhookUrl: "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
    });
    expect(configured).toMatchObject({ status: "homologation" });
    const active = await clubWhisky.transitionIntegrationLifecycle(context, {
      event: "activate",
      expectedVersion: 1,
      contractVersion: "2026-07-30",
      evidence: "Joint synthetic contract and inventory validation",
    });
    expect(active).toMatchObject({ status: "active", lifecycleVersion: 2 });
    const degraded = await clubWhisky.transitionIntegrationLifecycle(context, {
      event: "health",
      expectedVersion: 2,
      healthy: false,
      detail: "Synthetic webhook delivery failed",
    });
    expect(degraded).toMatchObject({ status: "degraded", lifecycleVersion: 3 });
    expect(degraded.lastHealthAt).toEqual(expect.any(String));
    const recovered = await clubWhisky.transitionIntegrationLifecycle(context, {
      event: "health",
      expectedVersion: 3,
      healthy: true,
      detail: "Synthetic webhook and inventory probes passed",
    });
    expect(recovered).toMatchObject({ status: "active", lifecycleVersion: 4 });
    expect(recovered.lastHealthAt).toEqual(expect.any(String));
    const revoked = await clubWhisky.transitionIntegrationLifecycle(context, {
      event: "revoke",
      expectedVersion: 4,
      reason: "Synthetic tenant administrator revocation",
    });
    expect(revoked).toMatchObject({ status: "revoked", lifecycleVersion: 5 });
    expect(revoked.lastHealthAt).toBe(recovered.lastHealthAt);
    await expect(
      clubWhisky.transitionIntegrationLifecycle(context, {
        event: "health",
        expectedVersion: 4,
        healthy: true,
        detail: "stale probe",
      }),
    ).rejects.toThrow(/version is stale/);
  });

  async function createTenant(label: string) {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: `F15 ${label}`,
        slug: `f15-${label}-${Date.now()}-${tenantIds.length}`,
        status: "active",
      })
      .returning();
    if (!tenant) throw new Error("tenant fixture failed");
    tenantIds.push(tenant.id);
    return tenant;
  }
});
