import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  invitations,
  roles,
  sessions,
  subscriptions,
  tenants,
  userRoles,
  users,
} from "@giromesa/db";
import { TRIAL_DAYS } from "@giromesa/domain";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { AuthService } from "./auth.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(invitations).where(eq(invitations.tenantId, tenantId));
  await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
  await db.delete(userRoles).where(eq(userRoles.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(roles).where(eq(roles.tenantId, tenantId));
  await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

runIntegration("AuthService RBAC operations", () => {
  let pool: Pool;
  let db: Db;
  let service: AuthService;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new AuthService({ db } as DatabaseService);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("updates roles, creates invitations and assigns user roles within one tenant", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Auth Test", slug: `auth-test-${Date.now()}`, status: "active" })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create tenant");
    }

    await cleanupTenant(db, tenant.id);
    const [createdTenant] = await db
      .insert(tenants)
      .values({
        id: tenant.id,
        name: "Auth Test",
        slug: `auth-test-${Date.now()}`,
        status: "active",
      })
      .returning();
    const [ownerRole] = await db
      .insert(roles)
      .values({
        tenantId: createdTenant?.id,
        code: "owner",
        name: "Owner",
        permissions: ["tenant:manage"],
      })
      .returning();
    const [operatorRole] = await db
      .insert(roles)
      .values({
        tenantId: createdTenant?.id,
        code: "operator",
        name: "Operator",
        permissions: ["pos:operate"],
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: createdTenant?.id,
        email: `auth-user-${Date.now()}@example.com`,
        name: "Auth User",
      })
      .returning();

    if (!createdTenant || !ownerRole || !operatorRole || !user) {
      throw new Error("Failed to create auth fixture");
    }

    const context = {
      tenantId: createdTenant.id,
      userId: user.id,
      requestId: "auth-test",
      permissions: ["tenant:manage"],
    };

    const updatedRole = await service.updateRole(context, operatorRole.id, {
      permissions: ["pos:operate", "pos:kds_send"],
    });
    expect(updatedRole.permissions).toContain("pos:kds_send");

    const invitation = await service.createInvitation(context, {
      email: "new-user@example.com",
      roleId: ownerRole.id,
    });
    expect(invitation.status).toBe("pending");
    expect(invitation.roleCode).toBe("owner");

    const assignment = await service.assignUserRole(context, user.id, {
      roleId: operatorRole.id,
    });
    expect(assignment.role.code).toBe("operator");

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, createdTenant.id));
    expect(auditRows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["role.updated", "invitation.created", "user.role_assigned"]),
    );

    await cleanupTenant(db, createdTenant.id);
  });

  it("starts a public seven-day trial with owner, branch, subscription, audit and session", async () => {
    const timestamp = Date.now();
    const result = await service.startTrial(
      {
        establishmentName: `Trial Bistro ${timestamp}`,
        ownerName: "Trial Owner",
        ownerEmail: `trial-owner-${timestamp}@example.com`,
        password: "Teste@12345",
        phone: "11999999999",
        branchName: "Matriz",
        planCode: "professional",
      },
      { "user-agent": "vitest" },
    );

    expect(result.tenant.status).toBe("trial");
    expect(result.subscription.status).toBe("trial");
    expect(result.subscription.trialDays).toBe(TRIAL_DAYS);
    expect(result.token.length).toBeGreaterThanOrEqual(40);

    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.tenantId, result.tenant.id))
      .limit(1);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, result.tenant.id))
      .limit(1);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tenantId, result.tenant.id))
      .limit(1);

    expect(branch?.name).toBe("Matriz");
    expect(audit?.action).toBe("auth.trial_started");
    expect(session?.userId).toBe(result.user.id);

    await cleanupTenant(db, result.tenant.id);
  });
});
