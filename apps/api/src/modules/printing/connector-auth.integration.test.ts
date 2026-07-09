import * as schema from "@giromesa/db";
import { auditLogs, branches, integrationAccounts, tenants } from "@giromesa/db";
import { UnauthorizedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { ConnectorAuthService } from "./connector-auth.service";
import { PrintingService } from "./printing.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

runIntegration("local printer connector credentials", () => {
  let pool: Pool;
  let db: Db;
  let databaseService: DatabaseService;
  let tenantId: string;
  let branchId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    databaseService = { db } as DatabaseService;

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Printer Connector Test",
        slug: `printer-connector-${Date.now()}`,
        status: "active",
      })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create tenant fixture");
    }

    const [branch] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: "Matriz" })
      .returning();

    if (!branch) {
      throw new Error("Failed to create branch fixture");
    }

    tenantId = tenant.id;
    branchId = branch.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await cleanupTenant(db, tenantId);
    }
    await pool.end();
  });

  it("provisions a branch-scoped connector key and resolves connector context", async () => {
    const printingService = new PrintingService(databaseService);
    const connectorAuthService = new ConnectorAuthService(databaseService);

    const provisioned = await printingService.configureConnector(
      {
        tenantId,
        branchId,
        requestId: "test-request",
        permissions: ["hardware:manage"],
      },
      { branchId, rotateKey: true },
    );

    expect(provisioned.apiKey).toMatch(/^gm_print_/);
    expect(provisioned.apiKeyReturnedOnce).toBe(true);
    expect(provisioned.apiKeyLastFour).toBe(provisioned.apiKey?.slice(-4));
    expect(provisioned.hasApiKey).toBe(true);

    const context = await connectorAuthService.resolveContext(
      {
        "x-giromesa-connector-key": provisioned.apiKey,
        "x-request-id": "connector-request",
      },
      "print_jobs:read",
    );

    expect(context.tenantId).toBe(tenantId);
    expect(context.branchId).toBe(branchId);
    expect(context.permissions).toContain("print_jobs:read");
    expect(context.permissions).toContain("print_jobs:process");

    const heartbeat = await printingService.recordConnectorHeartbeat(context, {
      version: "0.1.0",
      hostname: "printer-box",
      platform: "win32",
      dryRun: true,
      printerCount: 2,
    });

    expect(heartbeat.online).toBe(true);
    expect(heartbeat.lastSyncAt).toBeInstanceOf(Date);
    expect(heartbeat.heartbeat.version).toBe("0.1.0");
    expect(heartbeat.heartbeat.hostname).toBe("printer-box");
  });

  it("rejects invalid connector keys", async () => {
    const connectorAuthService = new ConnectorAuthService(databaseService);

    await expect(
      connectorAuthService.resolveContext(
        { "x-giromesa-connector-key": "gm_print_invalid" },
        "print_jobs:read",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
