import { createHash, randomBytes } from "node:crypto";
import {
  auditLogs,
  branches,
  fiscalAccountantInvitations,
  fiscalProviderCredentials,
  fiscalSettings,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { decryptSecret } from "../../common/secret-vault";
import { verifyTotpCode } from "../../common/totp";
import { DatabaseService } from "../database/database.service";

const onboardingOrder = [
  "not_started",
  "company_data",
  "accountant_review",
  "provider_validation",
  "homologation",
  "ready_for_production",
] as const;
type OnboardingStatus = (typeof onboardingOrder)[number] | "action_required";

@Injectable()
export class FiscalOnboardingService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async get(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    const [settings] = await this.database.db
      .select()
      .from(fiscalSettings)
      .where(
        and(eq(fiscalSettings.tenantId, context.tenantId), eq(fiscalSettings.branchId, branchId)),
      )
      .limit(1);
    const credentials = await this.database.db
      .select({
        id: fiscalProviderCredentials.id,
        environment: fiscalProviderCredentials.environment,
        status: fiscalProviderCredentials.status,
        tokenLastFour: fiscalProviderCredentials.tokenLastFour,
        rotatedAt: fiscalProviderCredentials.rotatedAt,
      })
      .from(fiscalProviderCredentials)
      .where(
        and(
          eq(fiscalProviderCredentials.tenantId, context.tenantId),
          eq(fiscalProviderCredentials.branchId, branchId),
        ),
      );
    const invitations = await this.database.db
      .select({
        id: fiscalAccountantInvitations.id,
        email: fiscalAccountantInvitations.email,
        status: fiscalAccountantInvitations.status,
        expiresAt: fiscalAccountantInvitations.expiresAt,
        revokedAt: fiscalAccountantInvitations.revokedAt,
        createdAt: fiscalAccountantInvitations.createdAt,
      })
      .from(fiscalAccountantInvitations)
      .where(
        and(
          eq(fiscalAccountantInvitations.tenantId, context.tenantId),
          eq(fiscalAccountantInvitations.branchId, branchId),
        ),
      )
      .orderBy(desc(fiscalAccountantInvitations.createdAt));
    return {
      branchId,
      status: (settings?.onboardingStatus ?? "not_started") as OnboardingStatus,
      settings: settings ?? null,
      credentials,
      invitations,
      production: {
        globalEnabled: process.env.FISCAL_PRODUCTION_ENABLED === "true",
        branchEnabled: Boolean(settings?.productionEnabledAt),
      },
    };
  }

  async start(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    const [settings] = await this.database.db
      .insert(fiscalSettings)
      .values({
        tenantId: context.tenantId,
        branchId,
        provider: "focus_nfe",
        status: "disabled",
        onboardingStatus: "company_data",
        environment: "homologation",
        taxRegime: "unconfigured",
        series: "",
      })
      .onConflictDoUpdate({
        target: [fiscalSettings.tenantId, fiscalSettings.branchId],
        set: { provider: "focus_nfe", updatedAt: new Date() },
      })
      .returning();
    await this.audit(context, branchId, "fiscal.onboarding_started", settings?.id);
    return this.get(context, branchId);
  }

  async updateCompany(
    context: TenantContext,
    input: {
      branchId: string;
      legalName: string;
      tradeName?: string | undefined;
      document: string;
      stateRegistration: string;
      municipalRegistration?: string | undefined;
      taxRegime: string;
      uf: string;
      cityCode: string;
      cityName: string;
      expectedVersion: number;
    },
  ) {
    await this.assertBranch(context, input.branchId);
    const normalizedDocument = input.document.replace(/\D/g, "");
    if (normalizedDocument.length !== 14) throw new BadRequestException("CNPJ must have 14 digits");
    const [updated] = await this.database.db
      .update(fiscalSettings)
      .set({
        legalName: input.legalName.trim(),
        tradeName: input.tradeName?.trim(),
        document: normalizedDocument,
        stateRegistration: input.stateRegistration.trim(),
        municipalRegistration: input.municipalRegistration?.trim(),
        taxRegime: input.taxRegime,
        uf: input.uf.toUpperCase(),
        cityCode: input.cityCode,
        cityName: input.cityName.trim(),
        onboardingStatus: "accountant_review",
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, input.branchId),
          eq(fiscalSettings.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException("Fiscal settings were updated concurrently");
    await this.audit(context, input.branchId, "fiscal.company_updated", updated.id);
    return updated;
  }

  async updateTaxProfile(
    context: TenantContext,
    input: {
      branchId: string;
      expectedVersion: number;
      cscId?: string | undefined;
      series: string;
      defaultModel: "nfce" | "nfe" | "nfse";
      defaults: Record<string, unknown>;
    },
  ) {
    await this.assertBranch(context, input.branchId);
    if (input.defaults.accountantReviewConfirmed !== true) {
      throw new BadRequestException("Accountant review confirmation is required");
    }
    const [current] = await this.database.db
      .select()
      .from(fiscalSettings)
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, input.branchId),
        ),
      )
      .limit(1);
    if (!current) throw new NotFoundException("Start fiscal onboarding first");
    const [updated] = await this.database.db
      .update(fiscalSettings)
      .set({
        series: input.series,
        defaultModel: input.defaultModel,
        config: {
          ...current.config,
          taxProfile: { cscId: input.cscId, defaults: input.defaults },
        },
        onboardingStatus: "provider_validation",
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(fiscalSettings.id, current.id), eq(fiscalSettings.version, input.expectedVersion)),
      )
      .returning();
    if (!updated) throw new ConflictException("Fiscal settings were updated concurrently");
    await this.audit(context, input.branchId, "fiscal.tax_profile_updated", updated.id);
    return updated;
  }

  async inviteAccountant(
    context: TenantContext,
    input: { branchId: string; email: string; expiresInHours: number },
  ) {
    await this.assertBranch(context, input.branchId);
    if (!context.userId) throw new UnauthorizedException("Authenticated user is required");
    const token = randomBytes(32).toString("base64url");
    const [invitation] = await this.database.db
      .insert(fiscalAccountantInvitations)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        email: input.email.trim().toLowerCase(),
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
        createdByUserId: context.userId,
      })
      .returning();
    if (!invitation) throw new Error("Failed to create accountant invitation");
    await this.audit(context, input.branchId, "fiscal.accountant_invited", invitation.id, {
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    });
    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      deliveryStatus: "pending_external_email",
      ...(process.env.NODE_ENV === "production" ? {} : { localPreviewToken: token }),
    };
  }

  async revokeInvitation(context: TenantContext, invitationId: string) {
    const now = new Date();
    const [invitation] = await this.database.db
      .update(fiscalAccountantInvitations)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(fiscalAccountantInvitations.tenantId, context.tenantId),
          eq(fiscalAccountantInvitations.id, invitationId),
          eq(fiscalAccountantInvitations.status, "pending"),
        ),
      )
      .returning();
    if (!invitation) throw new NotFoundException("Active invitation not found");
    await this.audit(
      context,
      invitation.branchId,
      "fiscal.accountant_invitation_revoked",
      invitation.id,
    );
    return { id: invitation.id, status: invitation.status, revokedAt: invitation.revokedAt };
  }

  async providerDryRun(
    context: TenantContext,
    input: { branchId: string; scenario?: "success" | "rejected" | "uncertain" | undefined },
  ) {
    await this.assertBranch(context, input.branchId);
    this.assertSimulatorAllowed();
    if (input.scenario === "rejected") {
      return { ok: false, status: "rejected", errorCode: "simulator_company_rejected" };
    }
    if (input.scenario === "uncertain") {
      return {
        ok: false,
        status: "unknown",
        errorCode: "simulator_result_unknown",
        queryRequired: true,
      };
    }
    return { ok: true, status: "validated", provider: "focus_nfe_simulator" };
  }

  async registerSimulator(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    this.assertSimulatorAllowed();
    const [settings] = await this.database.db
      .update(fiscalSettings)
      .set({
        status: "enabled",
        environment: "homologation",
        providerCompanyId: `sim-${branchId}`,
        providerMetadata: { simulator: true, registeredAt: new Date().toISOString() },
        onboardingStatus: "homologation",
        lastHealthStatus: "simulator_ready",
        updatedAt: new Date(),
      })
      .where(
        and(eq(fiscalSettings.tenantId, context.tenantId), eq(fiscalSettings.branchId, branchId)),
      )
      .returning();
    if (!settings) throw new NotFoundException("Start fiscal onboarding first");
    await this.audit(context, branchId, "fiscal.provider_simulator_registered", settings.id);
    return settings;
  }

  async runHomologation(
    context: TenantContext,
    input: { branchId: string; scenarios?: string[] | undefined },
  ) {
    await this.assertBranch(context, input.branchId);
    this.assertSimulatorAllowed();
    const supported = ["authorized", "rejected", "unknown", "duplicate", "query", "cancel"];
    const requested = input.scenarios?.length ? input.scenarios : supported;
    const results = requested.map((scenario) => ({
      scenario,
      ok: supported.includes(scenario),
      status:
        scenario === "unknown"
          ? "query_required"
          : scenario === "rejected"
            ? "expected_rejection"
            : "passed",
    }));
    const allPassed = results.every((result) => result.ok);
    await this.database.db
      .update(fiscalSettings)
      .set({
        onboardingStatus: allPassed ? "ready_for_production" : "action_required",
        lastHealthStatus: allPassed ? "homologation_passed" : "homologation_failed",
        lastHealthErrorCode: allPassed ? null : "simulator_scenario_unsupported",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, input.branchId),
        ),
      );
    await this.audit(context, input.branchId, "fiscal.homologation_simulated", undefined, {
      scenarios: requested,
      allPassed,
    });
    return { provider: "focus_nfe_simulator", allPassed, results };
  }

  async enableProduction(
    context: TenantContext,
    input: { branchId: string; reason: string; mfaCode: string; expectedVersion: number },
  ) {
    if (process.env.FISCAL_PRODUCTION_ENABLED !== "true") {
      throw new ForbiddenException("Fiscal production is disabled by infrastructure");
    }
    await this.assertBranch(context, input.branchId);
    await this.assertMfa(context, input.mfaCode);
    const [productionSettings] = await this.database.db
      .select({
        certificateFingerprint: fiscalSettings.certificateFingerprint,
        providerCertificateStatus: fiscalSettings.providerCertificateStatus,
        providerMetadata: fiscalSettings.providerMetadata,
      })
      .from(fiscalSettings)
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, input.branchId),
        ),
      )
      .limit(1);
    if (
      !productionSettings?.certificateFingerprint ||
      productionSettings.providerCertificateStatus !== "provider_accepted" ||
      productionSettings.providerMetadata?.simulator === true
    ) {
      throw new BadRequestException("A certificate accepted by the real provider is required");
    }
    const [credential] = await this.database.db
      .select({ id: fiscalProviderCredentials.id })
      .from(fiscalProviderCredentials)
      .where(
        and(
          eq(fiscalProviderCredentials.tenantId, context.tenantId),
          eq(fiscalProviderCredentials.branchId, input.branchId),
          eq(fiscalProviderCredentials.provider, "focus_nfe"),
          eq(fiscalProviderCredentials.environment, "production"),
          eq(fiscalProviderCredentials.status, "active"),
        ),
      )
      .limit(1);
    if (!credential) throw new BadRequestException("Active production credential is required");
    const now = new Date();
    const [updated] = await this.database.db
      .update(fiscalSettings)
      .set({
        environment: "production",
        status: "enabled",
        productionEnabledAt: now,
        productionEnabledBy: context.userId,
        productionEnabledReason: input.reason.trim(),
        version: input.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, input.branchId),
          eq(fiscalSettings.provider, "focus_nfe"),
          eq(fiscalSettings.onboardingStatus, "ready_for_production"),
          eq(fiscalSettings.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated)
      throw new ConflictException("Fiscal production prerequisites or version are invalid");
    await this.audit(context, input.branchId, "fiscal.production_enabled", updated.id, {
      reason: input.reason.trim(),
    });
    return updated;
  }

  async disableProduction(context: TenantContext, branchId: string, reason: string) {
    await this.assertBranch(context, branchId);
    const [updated] = await this.database.db
      .update(fiscalSettings)
      .set({
        status: "disabled",
        environment: "homologation",
        productionEnabledAt: null,
        productionEnabledBy: null,
        productionEnabledReason: reason.trim(),
        version: sql`${fiscalSettings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(fiscalSettings.tenantId, context.tenantId), eq(fiscalSettings.branchId, branchId)),
      )
      .returning();
    if (!updated) throw new NotFoundException("Fiscal settings not found");
    await this.audit(context, branchId, "fiscal.production_disabled", updated.id, { reason });
    return updated;
  }

  private assertSimulatorAllowed() {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Fiscal simulator is disabled in production");
    }
  }

  private async assertMfa(context: TenantContext, code: string) {
    if (!context.userId) throw new UnauthorizedException("Authenticated user is required");
    const [user] = await this.database.db
      .select({ mfaEnabled: users.mfaEnabled, mfaSecretRef: users.mfaSecretRef })
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
      .limit(1);
    if (
      !user?.mfaEnabled ||
      !user.mfaSecretRef ||
      !verifyTotpCode(decryptSecret(user.mfaSecretRef), code)
    ) {
      throw new UnauthorizedException("Valid MFA code is required");
    }
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
  }

  private async audit(
    context: TenantContext,
    branchId: string,
    action: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType: "fiscal_onboarding",
      entityId,
      metadata,
    });
  }
}
