import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  commercialInterests,
  invitations,
  legalAcceptances,
  operationalEvents,
  purchaseIntents,
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
import { hashOpaqueToken } from "../../common/http";
import type { DatabaseService } from "../database/database.service";
import { AuthService } from "./auth.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
  await db.delete(legalAcceptances).where(eq(legalAcceptances.tenantId, tenantId));
  await db.delete(invitations).where(eq(invitations.tenantId, tenantId));
  await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
  await db.delete(userRoles).where(eq(userRoles.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(roles).where(eq(roles.tenantId, tenantId));
  await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  await db.delete(purchaseIntents).where(eq(purchaseIntents.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

runIntegration("AuthService RBAC operations", () => {
  let pool: Pool;
  let db: Db;
  let service: AuthService;
  let previousPasswordPepper: string | undefined;
  let previousEmailProvider: string | undefined;

  beforeAll(() => {
    previousPasswordPepper = process.env.PASSWORD_PEPPER;
    previousEmailProvider = process.env.EMAIL_PROVIDER;
    process.env.PASSWORD_PEPPER = "synthetic-auth-integration-pepper";
    process.env.EMAIL_PROVIDER = "mock";
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new AuthService({ db } as DatabaseService);
  });

  afterAll(async () => {
    await pool.end();
    restoreEnvironmentValue("PASSWORD_PEPPER", previousPasswordPepper);
    restoreEnvironmentValue("EMAIL_PROVIDER", previousEmailProvider);
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

  it("accepts an invitation exactly once under concurrent requests", async () => {
    const timestamp = Date.now();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Invite Race", slug: `invite-race-${timestamp}`, status: "active" })
      .returning();
    if (!tenant) throw new Error("Failed to create tenant");

    const [role] = await db
      .insert(roles)
      .values({ tenantId: tenant.id, code: "manager", name: "Manager", permissions: [] })
      .returning();
    if (!role) throw new Error("Failed to create role");

    const token = `invite-${timestamp}-abcdefghijklmnopqrstuvwxyz`;
    await db.insert(invitations).values({
      tenantId: tenant.id,
      email: `invite-${timestamp}@example.com`,
      roleId: role.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const attempts = await Promise.allSettled([
      service.acceptInvitation({ token, password: "Convite@12345" }, { "user-agent": "race-a" }),
      service.acceptInvitation({ token, password: "Convite@12345" }, { "user-agent": "race-b" }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);

    const acceptedInvitations = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tenantId, tenant.id));
    const createdUsers = await db.select().from(users).where(eq(users.tenantId, tenant.id));
    const createdSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tenantId, tenant.id));

    expect(acceptedInvitations[0]?.acceptedAt).toBeInstanceOf(Date);
    expect(createdUsers).toHaveLength(1);
    expect(createdSessions).toHaveLength(1);

    await cleanupTenant(db, tenant.id);
  });

  it("keeps one append-only acceptance for the same legal document version", async () => {
    process.env.LEGAL_TERMS_VERSION = "pilot-v1";
    process.env.LEGAL_TERMS_SHA256 = "a".repeat(64);
    process.env.LEGAL_PRIVACY_VERSION = "pilot-v1";
    process.env.LEGAL_PRIVACY_SHA256 = "b".repeat(64);
    const timestamp = Date.now();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Legal Evidence", slug: `legal-evidence-${timestamp}`, status: "active" })
      .returning();
    if (!tenant) throw new Error("Failed to create tenant");
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `legal-${timestamp}@example.com`,
        name: "Legal User",
      })
      .returning();
    if (!user) throw new Error("Failed to create user");

    const context = {
      tenantId: tenant.id,
      userId: user.id,
      requestId: "legal-test",
      permissions: [],
    };
    const first = await service.recordLegalAcceptance(
      context,
      { documentType: "terms", origin: "onboarding" },
      { "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" },
    );
    const repeated = await service.recordLegalAcceptance(
      context,
      { documentType: "terms", origin: "onboarding" },
      { "user-agent": "vitest" },
    );
    expect(await service.getLegalAcceptanceStatus(context)).toMatchObject({
      required: true,
      complete: false,
      configurationComplete: true,
    });
    await service.recordLegalAcceptance(
      context,
      { documentType: "privacy", origin: "authenticated_legal_gate" },
      { "user-agent": "vitest" },
    );
    expect(await service.getLegalAcceptanceStatus(context)).toMatchObject({
      required: true,
      complete: true,
      configurationComplete: true,
    });
    process.env.LEGAL_TERMS_VERSION = "pilot-v2";
    process.env.LEGAL_TERMS_SHA256 = "c".repeat(64);
    expect(await service.getLegalAcceptanceStatus(context)).toMatchObject({
      required: true,
      complete: false,
    });
    const rows = await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.tenantId, tenant.id));

    expect(repeated.id).toBe(first.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.documentType === "terms")).toMatchObject({
      documentType: "terms",
      documentVersion: "pilot-v1",
      documentHash: "a".repeat(64),
      origin: "onboarding",
    });

    await cleanupTenant(db, tenant.id);
    delete process.env.LEGAL_TERMS_VERSION;
    delete process.env.LEGAL_TERMS_SHA256;
    delete process.env.LEGAL_PRIVACY_VERSION;
    delete process.env.LEGAL_PRIVACY_SHA256;
  });

  it("keeps authenticated operation blocked when legal publication is absent or partial", async () => {
    const previous = {
      termsVersion: process.env.LEGAL_TERMS_VERSION,
      termsHash: process.env.LEGAL_TERMS_SHA256,
      privacyVersion: process.env.LEGAL_PRIVACY_VERSION,
      privacyHash: process.env.LEGAL_PRIVACY_SHA256,
    };
    const timestamp = Date.now();
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Legal Fail Closed",
        slug: `legal-fail-closed-${timestamp}`,
        status: "active",
      })
      .returning();
    if (!tenant) throw new Error("Failed to create tenant");
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `legal-fail-closed-${timestamp}@example.com`,
        name: "Legal Blocked User",
      })
      .returning();
    if (!user) throw new Error("Failed to create user");
    const context = {
      tenantId: tenant.id,
      userId: user.id,
      requestId: "legal-fail-closed-test",
      permissions: [],
    };

    try {
      delete process.env.LEGAL_TERMS_VERSION;
      delete process.env.LEGAL_TERMS_SHA256;
      delete process.env.LEGAL_PRIVACY_VERSION;
      delete process.env.LEGAL_PRIVACY_SHA256;
      await expect(service.getLegalAcceptanceStatus(context)).resolves.toMatchObject({
        required: true,
        complete: false,
        configurationComplete: false,
        documents: [
          { documentType: "terms", published: false, accepted: false },
          { documentType: "privacy", published: false, accepted: false },
        ],
      });

      process.env.LEGAL_TERMS_VERSION = "pilot-v1";
      process.env.LEGAL_TERMS_SHA256 = "a".repeat(64);
      await expect(service.getLegalAcceptanceStatus(context)).resolves.toMatchObject({
        required: true,
        complete: false,
        configurationComplete: false,
        documents: [
          { documentType: "terms", published: true, accepted: false },
          { documentType: "privacy", published: false, accepted: false },
        ],
      });
    } finally {
      await cleanupTenant(db, tenant.id);
      restoreEnvironmentValue("LEGAL_TERMS_VERSION", previous.termsVersion);
      restoreEnvironmentValue("LEGAL_TERMS_SHA256", previous.termsHash);
      restoreEnvironmentValue("LEGAL_PRIVACY_VERSION", previous.privacyVersion);
      restoreEnvironmentValue("LEGAL_PRIVACY_SHA256", previous.privacyHash);
    }
  });

  it("persists validated commercial plan and origin", async () => {
    const interest = await service.createCommercialInterest({
      product: "giromesa",
      planCode: "professional",
      origin: "pricing",
      establishmentName: "Bistro Piloto",
      contactName: "Maria",
      email: "MARIA@BISTRO.TEST",
    });
    const [stored] = await db
      .select()
      .from(commercialInterests)
      .where(eq(commercialInterests.id, interest.id));

    expect(stored).toMatchObject({
      product: "giromesa",
      planCode: "professional",
      origin: "pricing",
      email: "maria@bistro.test",
    });

    await db.delete(commercialInterests).where(eq(commercialInterests.id, interest.id));
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

  it("records subscription activation requests as tenant audit events", async () => {
    const timestamp = Date.now();
    const result = await service.startTrial(
      {
        establishmentName: `Activation Bistro ${timestamp}`,
        ownerName: "Activation Owner",
        ownerEmail: `activation-owner-${timestamp}@example.com`,
        password: "Teste@12345",
        phone: "11999999999",
        branchName: "Matriz",
        planCode: "professional",
      },
      { "user-agent": "vitest" },
    );

    const activation = await service.requestSubscriptionActivation(
      {
        tenantId: result.tenant.id,
        userId: result.user.id,
        requestId: "activation-test",
        permissions: ["tenant:manage"],
      },
      {
        planCode: "premium",
        paymentMethod: "pix",
        billingEmail: "financeiro@example.com",
        billingDocument: "12.345.678/0001-90",
        notes: "Ativar antes do fim do teste.\nSem quebrar a operação.",
      },
      { "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" },
    );

    expect(activation).toMatchObject({
      status: "queued",
      planCode: "premium",
      nextStep: "commercial_follow_up",
    });

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, result.tenant.id))
      .orderBy(auditLogs.createdAt)
      .limit(1);
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, result.tenant.id));

    expect(auditRows.map((row) => row.action)).toContain(
      "billing.subscription_activation_requested",
    );
    const activationAudit = auditRows.find(
      (row) => row.action === "billing.subscription_activation_requested",
    );
    expect(activationAudit?.entityId).toBe(result.tenant.id);
    expect(activationAudit?.metadata).toMatchObject({
      planCode: "premium",
      paymentMethod: "pix",
      billingEmail: "financeiro@example.com",
      hasBillingDocument: true,
      checkoutReady: false,
    });
    expect(String(activationAudit?.metadata.notes)).not.toContain("\n");
    expect(audit?.tenantId).toBe(result.tenant.id);

    await cleanupTenant(db, result.tenant.id);
  });
});
