import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  branches,
  invitations,
  plans,
  roles,
  subscriptions,
  tenants,
  userRoles,
  users,
} from "@giromesa/db";
import { type DocumentBranding, renderBrandedEmail, type TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { createEmailProvider } from "../../common/email-provider";
import { createSessionToken } from "../../common/http";
import { hashPassword } from "../../common/password";
import { DatabaseService } from "../database/database.service";

type PlanCode = "starter" | "professional" | "premium";
type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "canceled";
type SupportPriority = "normal" | "high";

type CreatePlatformTenantInput = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  planCode: PlanCode;
  document?: string | undefined;
  branchName: string;
};

type UpdatePlatformTenantSupportInput = {
  priority: SupportPriority;
  supportStatus: "queued" | "in_progress" | "waiting_customer" | "resolved";
  commercialNotes: string;
  relationshipOwnerName?: string | undefined;
  relationshipOwnerEmail?: string | undefined;
  slaTier: "standard" | "priority" | "critical";
  nextFollowUpAt?: string | null | undefined;
  contactSummary?: string | undefined;
};

type ListPlatformCommunicationsInput = {
  tenantId?: string;
  type?: "trial_ending" | "past_due" | "support_follow_up";
  limit?: number;
};

const planCatalog: Record<
  PlanCode,
  { name: string; priceCents: number; limits: Record<string, number> }
> = {
  starter: { name: "Starter", priceCents: 14900, limits: { branches: 1, users: 5, products: 150 } },
  professional: {
    name: "Professional",
    priceCents: 29900,
    limits: { branches: 2, users: 15, products: 600 },
  },
  premium: {
    name: "Premium",
    priceCents: 49900,
    limits: { branches: 5, users: 40, products: 2000 },
  },
};

@Injectable()
export class PlatformService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listTenants() {
    const rows = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        document: tenants.document,
        status: tenants.status,
        settings: tenants.settings,
        createdAt: tenants.createdAt,
        planCode: plans.code,
        planName: plans.name,
        priceCents: plans.priceCents,
        subscriptionStatus: subscriptions.status,
        currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        branchCount: sql<number>`count(distinct ${branches.id})::int`,
        userCount: sql<number>`count(distinct ${users.id})::int`,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(branches, eq(branches.tenantId, tenants.id))
      .leftJoin(users, eq(users.tenantId, tenants.id))
      .groupBy(tenants.id, subscriptions.id, plans.id)
      .orderBy(desc(tenants.createdAt))
      .limit(50);

    return rows.map((row) => ({
      ...row,
      health: this.healthFor(row.status, Number(row.branchCount), Number(row.userCount)),
      nextAction: this.nextActionFor(row.status),
      trialDaysRemaining: this.trialDaysRemaining(row.currentPeriodEndsAt),
      billingStatus: this.billingStatusFor(row.status, row.currentPeriodEndsAt),
      onboardingChecklist: this.onboardingChecklistFor(
        row.status,
        Number(row.branchCount),
        Number(row.userCount),
        Boolean(row.planCode),
      ),
      asaas: {
        checkoutReady: row.status === "trial" || row.status === "past_due",
        providerSubscriptionId: row.providerSubscriptionId,
        nextStep:
          row.status === "active"
            ? "monitor_webhooks"
            : readAsaasNextStep(row.settings, "create_hosted_checkout_or_subscription"),
      },
      support: {
        priority: readSupportPriority(row.settings, row.status),
        status: readSupportStatus(row.settings),
        relationshipOwnerName: readSupportString(row.settings, "relationshipOwnerName"),
        nextFollowUpAt: readSupportNullableString(row.settings, "nextFollowUpAt"),
        slaTier: readSlaTier(row.settings),
        queueLabel: buildSupportQueueLabel(row.settings, row.status),
        alertType: buildSupportAlertType(row.settings, row.status, row.currentPeriodEndsAt),
      },
    }));
  }

  async getCommercialSummary() {
    const [tenantRows, communicationRows] = await Promise.all([
      this.listTenants(),
      this.listCommunications({ limit: 50 }),
    ]);
    const now = Date.now();

    const supportItems = tenantRows
      .filter((tenant) => tenant.support && tenant.support.status !== "resolved")
      .sort((a, b) => supportPriorityScore(b) - supportPriorityScore(a))
      .slice(0, 6)
      .map((tenant) => ({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        priority: tenant.support?.priority ?? "normal",
        status: tenant.support?.status ?? "queued",
        slaTier: tenant.support?.slaTier ?? "standard",
        queueLabel: tenant.support?.queueLabel ?? "Na fila",
        relationshipOwnerName: tenant.support?.relationshipOwnerName ?? "",
        alertType: tenant.support?.alertType ?? "none",
      }));
    const supportCountsByStatus = {
      queued: supportItems.filter((item) => item.status === "queued").length,
      inProgress: supportItems.filter((item) => item.status === "in_progress").length,
      waitingCustomer: supportItems.filter((item) => item.status === "waiting_customer").length,
      resolved: tenantRows.filter((tenant) => tenant.support?.status === "resolved").length,
    };

    const agendaItems = tenantRows
      .filter(
        (tenant) =>
          tenant.status === "trial" ||
          tenant.status === "past_due" ||
          tenant.support?.alertType === "follow_up",
      )
      .sort((a, b) => supportPriorityScore(b) - supportPriorityScore(a))
      .slice(0, 6)
      .map((tenant) => ({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        status: tenant.status,
        queueLabel: tenant.support?.queueLabel ?? tenant.nextAction,
        nextAction: tenant.nextAction,
        alertType: tenant.support?.alertType ?? "none",
      }));
    const trialEndingCount = tenantRows.filter(
      (tenant) => tenant.billingStatus === "trial_ending",
    ).length;
    const followUpsDueCount = tenantRows.filter(
      (tenant) => tenant.support?.alertType === "follow_up",
    ).length;
    const overdueFollowUpsCount = tenantRows.filter((tenant) => {
      const nextFollowUpAt = tenant.support?.nextFollowUpAt;
      return typeof nextFollowUpAt === "string" && new Date(nextFollowUpAt).getTime() < now;
    }).length;
    const trialsWithoutOwnerCount = tenantRows.filter(
      (tenant) =>
        tenant.status === "trial" && !(tenant.support?.relationshipOwnerName ?? "").trim(),
    ).length;
    const staleTrials7dCount = tenantRows.filter(
      (tenant) =>
        tenant.status === "trial" &&
        now - new Date(tenant.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000,
    ).length;
    const highTouchAccounts = tenantRows.filter(
      (tenant) =>
        tenant.support?.priority === "high" ||
        tenant.support?.slaTier === "priority" ||
        tenant.support?.slaTier === "critical",
    ).length;
    const communicationsLast7Days = communicationRows.filter(
      (item) => now - new Date(item.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000,
    ).length;

    return {
      overview: {
        totalTenants: tenantRows.length,
        active: tenantRows.filter((tenant) => tenant.status === "active").length,
        trials: tenantRows.filter((tenant) => tenant.status === "trial").length,
        pastDue: tenantRows.filter((tenant) => tenant.status === "past_due").length,
        suspended: tenantRows.filter((tenant) => tenant.status === "suspended").length,
        risks: tenantRows.filter((tenant) => tenant.status !== "active").length,
        supportQueue: supportItems.length,
        trialEnding: trialEndingCount,
        followUpsDue: followUpsDueCount,
        overdueFollowUps: overdueFollowUpsCount,
        trialsWithoutOwner: trialsWithoutOwnerCount,
        staleTrials7d: staleTrials7dCount,
        highTouchAccounts,
        mrrActiveCents: tenantRows.reduce(
          (sum, tenant) => (tenant.status === "active" ? sum + (tenant.priceCents ?? 0) : sum),
          0,
        ),
        pastDueMrrCents: tenantRows.reduce(
          (sum, tenant) => (tenant.status === "past_due" ? sum + (tenant.priceCents ?? 0) : sum),
          0,
        ),
        communicationsLast7Days,
      },
      pipeline: {
        active: tenantRows.filter((tenant) => tenant.status === "active").length,
        trial: tenantRows.filter((tenant) => tenant.status === "trial").length,
        pastDue: tenantRows.filter((tenant) => tenant.status === "past_due").length,
        onboardingRisk: tenantRows.filter(
          (tenant) =>
            tenant.status === "trial" &&
            tenant.onboardingChecklist.filter((item) => item.done).length < 4,
        ).length,
      },
      support: {
        openCount: supportItems.length,
        highPriorityCount: supportItems.filter((item) => item.priority === "high").length,
        countsByStatus: supportCountsByStatus,
        items: supportItems,
      },
      agenda: {
        countsByAlertType: {
          pastDue: agendaItems.filter((item) => item.alertType === "past_due").length,
          trialEnding: agendaItems.filter((item) => item.alertType === "trial_ending").length,
          highPriority: agendaItems.filter((item) => item.alertType === "high_priority").length,
          followUp: agendaItems.filter((item) => item.alertType === "follow_up").length,
        },
        items: agendaItems,
      },
      watchlist: {
        overdueFollowUpsCount,
        trialsWithoutOwnerCount,
        staleTrials7dCount,
      },
      communications: {
        recent: communicationRows.slice(0, 8),
        countsByType: {
          trialEnding: communicationRows.filter((item) => item.type === "trial_ending").length,
          pastDue: communicationRows.filter((item) => item.type === "past_due").length,
          supportFollowUp: communicationRows.filter((item) => item.type === "support_follow_up")
            .length,
        },
      },
    };
  }

  async listCommunications(input: ListPlatformCommunicationsInput = {}) {
    const filters = [like(auditLogs.action, "platform.tenant.communication_%")];
    if (input.tenantId) {
      filters.push(eq(auditLogs.tenantId, input.tenantId));
    }
    if (input.type) {
      filters.push(eq(auditLogs.action, `platform.tenant.communication_${input.type}_queued`));
    }

    const rows = await this.database.db
      .select({
        id: auditLogs.id,
        tenantId: auditLogs.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        action: auditLogs.action,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(tenants, eq(tenants.id, auditLogs.tenantId))
      .where(and(...filters))
      .orderBy(desc(auditLogs.createdAt))
      .limit(input.limit ?? 30);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      type: readCommunicationType(row.action),
      recipientEmail: readMetadataString(row.metadata, "recipientEmail"),
      provider: readMetadataString(row.metadata, "provider"),
      messageId: readMetadataString(row.metadata, "messageId"),
      createdAt: row.createdAt,
    }));
  }

  async createTenant(context: TenantContext, input: CreatePlatformTenantInput) {
    const slug = this.slugify(input.name);
    if (!slug) {
      throw new BadRequestException("Invalid tenant name");
    }

    return this.database.db.transaction(async (tx) => {
      const [existingTenant] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      if (existingTenant) {
        throw new BadRequestException("Tenant slug already exists");
      }

      const planDefinition = planCatalog[input.planCode];
      const [plan] = await tx
        .insert(plans)
        .values({
          code: input.planCode,
          name: planDefinition.name,
          priceCents: planDefinition.priceCents,
          limits: planDefinition.limits,
        })
        .onConflictDoUpdate({
          target: plans.code,
          set: {
            name: planDefinition.name,
            priceCents: planDefinition.priceCents,
            limits: planDefinition.limits,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!plan) {
        throw new Error("Failed to resolve plan");
      }

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug,
          document: input.document,
          status: "trial",
          settings: {
            onboardingStatus: "created",
            createdByPlatformUserId: context.userId,
          },
        })
        .returning();

      if (!tenant) {
        throw new Error("Failed to create tenant");
      }

      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: input.branchName,
          document: input.document,
        })
        .returning();

      const [ownerRole] = await tx
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

      const temporaryPassword = this.temporaryPassword(slug);
      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.ownerEmail.toLowerCase(),
          name: input.ownerName,
          passwordHash: await hashPassword(temporaryPassword),
        })
        .returning();

      if (!branch || !ownerRole || !owner) {
        throw new Error("Failed to create tenant bootstrap data");
      }

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          tenantId: tenant.id,
          planId: plan.id,
          provider: "asaas",
          status: "trial",
          currentPeriodEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .returning();

      await tx.insert(userRoles).values({
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        branchId: branch.id,
      });

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        branchId: branch.id,
        userId: owner.id,
        requestId: context.requestId,
        action: "platform.tenant.created",
        entityType: "tenant",
        entityId: tenant.id,
        metadata: {
          planCode: plan.code,
          platformUserId: context.userId,
          ownerEmail: owner.email,
        },
      });

      const { token: invitationToken, tokenHash } = createSessionToken();
      const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [invitation] = await tx
        .insert(invitations)
        .values({
          tenantId: tenant.id,
          email: owner.email,
          roleId: ownerRole.id,
          tokenHash,
          expiresAt: invitationExpiresAt,
        })
        .returning();

      const acceptUrl = this.publicAppUrl(`/invite/${invitationToken}`);
      const branding: DocumentBranding = {
        displayName: input.name,
        logoUrl: null,
        accentPreset: "emerald",
      };
      const emailDelivery = await createEmailProvider().send({
        tenantId: tenant.id,
        to: owner.email,
        subject: `Convite para ativar ${input.name}`,
        text: `Seu ambiente ${input.name} foi criado no GiroMesa. Acesse: ${acceptUrl}`,
        html: renderPlatformInviteEmail({
          branding,
          actionUrl: acceptUrl,
        }),
      });

      return {
        tenant,
        branch,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        },
        subscription,
        invitation: invitation
          ? {
              id: invitation.id,
              email: invitation.email,
              expiresAt: invitation.expiresAt,
              acceptUrl,
              delivery: emailDelivery.provider,
              tokenReturnedOnce: invitationToken,
            }
          : null,
        temporaryPassword,
        nextStep: "send_invitation_or_configure_asaas_checkout",
      };
    });
  }

  async getTenantDetail(tenantId: string) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        document: tenants.document,
        status: tenants.status,
        createdAt: tenants.createdAt,
        settings: tenants.settings,
        planCode: plans.code,
        planName: plans.name,
        priceCents: plans.priceCents,
        subscriptionStatus: subscriptions.status,
        currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        branchCount: sql<number>`count(distinct ${branches.id})::int`,
        userCount: sql<number>`count(distinct ${users.id})::int`,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(branches, eq(branches.tenantId, tenants.id))
      .leftJoin(users, eq(users.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
      .groupBy(tenants.id, subscriptions.id, plans.id)
      .limit(1);

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const [branchRows, userRows, auditRows] = await Promise.all([
      this.database.db
        .select({ id: branches.id, name: branches.name, isActive: branches.isActive })
        .from(branches)
        .where(eq(branches.tenantId, tenant.id))
        .orderBy(branches.name),
      this.database.db
        .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
        .from(users)
        .where(eq(users.tenantId, tenant.id))
        .orderBy(users.name)
        .limit(20),
      this.database.db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, tenant.id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(20),
    ]);

    return {
      ...tenant,
      health: this.healthFor(tenant.status, Number(tenant.branchCount), Number(tenant.userCount)),
      nextAction: this.nextActionFor(tenant.status),
      trialDaysRemaining: this.trialDaysRemaining(tenant.currentPeriodEndsAt),
      billingStatus: this.billingStatusFor(tenant.status, tenant.currentPeriodEndsAt),
      onboardingChecklist: this.onboardingChecklistFor(
        tenant.status,
        Number(tenant.branchCount),
        Number(tenant.userCount),
        Boolean(tenant.planCode),
      ),
      asaas: {
        checkoutReady: tenant.status === "trial" || tenant.status === "past_due",
        providerSubscriptionId: tenant.providerSubscriptionId,
        nextStep:
          tenant.status === "active"
            ? "monitor_webhooks"
            : readAsaasNextStep(tenant.settings, "create_hosted_checkout_or_subscription"),
      },
      branches: branchRows,
      users: userRows,
      timeline: auditRows,
      support: {
        priority: readSupportPriority(tenant.settings, tenant.status),
        status: readSupportStatus(tenant.settings),
        commercialNotes: readCommercialNotes(tenant.settings),
        relationshipOwnerName: readSupportString(tenant.settings, "relationshipOwnerName"),
        relationshipOwnerEmail: readSupportString(tenant.settings, "relationshipOwnerEmail"),
        slaTier: readSlaTier(tenant.settings),
        nextFollowUpAt: readSupportNullableString(tenant.settings, "nextFollowUpAt"),
        contactHistory: readContactHistory(tenant.settings),
      },
    };
  }

  async updateTenantStatus(context: TenantContext, tenantId: string, status: TenantStatus) {
    const [tenant] = await this.database.db
      .update(tenants)
      .set({ status, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    await this.database.db
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenant.id));

    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.tenantId, tenant.id))
      .limit(1);

    await this.database.db.insert(auditLogs).values({
      tenantId: tenant.id,
      branchId: branch?.id,
      userId: null,
      requestId: context.requestId,
      action: "platform.tenant.status_updated",
      entityType: "tenant",
      entityId: tenant.id,
      metadata: {
        nextStatus: status,
        platformUserId: context.userId,
      },
    });

    return tenant;
  }

  async updateTenantSupport(
    context: TenantContext,
    tenantId: string,
    input: UpdatePlatformTenantSupportInput,
  ) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const nextSettings: Record<string, unknown> = {
      ...tenant.settings,
      commercialNotes: input.commercialNotes.trim(),
      supportPriority: input.priority,
      supportStatus: input.supportStatus,
      relationshipOwnerName: input.relationshipOwnerName?.trim() || null,
      relationshipOwnerEmail: input.relationshipOwnerEmail?.trim() || null,
      slaTier: input.slaTier,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      supportLastUpdatedAt: new Date().toISOString(),
      supportLastUpdatedBy: context.userId ?? null,
    };
    const nextContactHistory = readContactHistory(nextSettings);
    if (input.contactSummary?.trim()) {
      nextContactHistory.unshift({
        id: crypto.randomUUID(),
        summary: input.contactSummary.trim(),
        createdAt: new Date().toISOString(),
        createdBy: context.userId ?? null,
      });
    }
    nextSettings.contactHistory = nextContactHistory.slice(0, 12);

    const [updated] = await this.database.db
      .update(tenants)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
      .returning({
        id: tenants.id,
        settings: tenants.settings,
      });

    await this.database.db.insert(auditLogs).values({
      tenantId: tenant.id,
      userId: null,
      requestId: context.requestId,
      action: "platform.tenant.support_updated",
      entityType: "tenant",
      entityId: tenant.id,
      metadata: {
        platformUserId: context.userId,
        priority: input.priority,
        supportStatus: input.supportStatus,
        notesLength: input.commercialNotes.trim().length,
        relationshipOwnerName: input.relationshipOwnerName?.trim() || null,
        slaTier: input.slaTier,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        contactLogged: Boolean(input.contactSummary?.trim()),
      },
    });

    return {
      tenantId: updated?.id ?? tenant.id,
      support: {
        priority: readSupportPriority(updated?.settings ?? nextSettings, "trial"),
        status: readSupportStatus(updated?.settings ?? nextSettings),
        commercialNotes: readCommercialNotes(updated?.settings ?? nextSettings),
        relationshipOwnerName: readSupportString(
          updated?.settings ?? nextSettings,
          "relationshipOwnerName",
        ),
        relationshipOwnerEmail: readSupportString(
          updated?.settings ?? nextSettings,
          "relationshipOwnerEmail",
        ),
        slaTier: readSlaTier(updated?.settings ?? nextSettings),
        nextFollowUpAt: readSupportNullableString(
          updated?.settings ?? nextSettings,
          "nextFollowUpAt",
        ),
        contactHistory: readContactHistory(updated?.settings ?? nextSettings),
      },
    };
  }

  async prepareAsaasCheckout(context: TenantContext, tenantId: string) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        settings: tenants.settings,
        planCode: plans.code,
        priceCents: plans.priceCents,
        subscriptionId: subscriptions.id,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const env = loadEnv();
    const reference = `gm-sub-${tenant.slug}-${Date.now()}`;
    const fallbackCheckoutUrl = this.publicAppUrl(
      `/platform/${tenant.id}?asaas=checkout-homologation&plan=${tenant.planCode ?? "starter"}`,
    );
    let checkoutUrl = fallbackCheckoutUrl;
    let nextStep = "replace_mock_url_with_asaas_hosted_checkout_when_credentials_are_available";
    let mode = "homologation_mock";
    let providerCheckoutId: string | null = null;

    if (env.ASAAS_API_KEY) {
      const asaasCheckout = await this.createAsaasCheckout({
        apiKey: env.ASAAS_API_KEY,
        environment: env.ASAAS_ENV,
        baseUrl: env.ASAAS_ENV === "production" ? env.ASAAS_PRODUCTION_URL : env.ASAAS_SANDBOX_URL,
        tenantId: tenant.id,
        tenantName: tenant.name,
        planCode: tenant.planCode ?? "starter",
        priceCents: tenant.priceCents ?? planCatalog.starter.priceCents,
        reference,
      });
      checkoutUrl = asaasCheckout.checkoutUrl;
      nextStep = "share_hosted_checkout_with_customer_and_monitor_webhooks";
      mode = "asaas_hosted_checkout";
      providerCheckoutId = asaasCheckout.providerCheckoutId;
    }

    const nextSettings = {
      ...tenant.settings,
      asaasLastCheckout: {
        provider: "asaas",
        environment: env.ASAAS_ENV,
        reference,
        checkoutUrl,
        providerCheckoutId,
        mode,
        preparedAt: new Date().toISOString(),
        nextStep,
      },
    };

    await this.database.db
      .update(tenants)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    if (tenant.subscriptionId && providerCheckoutId) {
      await this.database.db
        .update(subscriptions)
        .set({
          providerSubscriptionId: providerCheckoutId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, tenant.subscriptionId));
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: tenant.id,
      userId: null,
      requestId: context.requestId,
      action: "platform.asaas.checkout_prepared",
      entityType: "tenant",
      entityId: tenant.id,
      metadata: {
        platformUserId: context.userId,
        planCode: tenant.planCode,
        priceCents: tenant.priceCents,
        mode,
        reference,
        providerCheckoutId,
      },
    });

    return {
      provider: "asaas",
      environment: env.ASAAS_ENV,
      tenantId: tenant.id,
      checkoutUrl,
      reference,
      providerCheckoutId,
      nextStep,
    };
  }

  async simulateAsaasPastDue(context: TenantContext, tenantId: string) {
    return this.updateTenantStatus(context, tenantId, "past_due");
  }

  async sendTenantCommunication(
    context: TenantContext,
    tenantId: string,
    type: "trial_ending" | "past_due" | "support_follow_up",
  ) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        settings: tenants.settings,
        status: tenants.status,
        currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const [recipient] = await this.database.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)))
      .limit(1);

    if (!recipient?.email) {
      throw new NotFoundException("Tenant recipient not found");
    }

    const branding = readTenantBranding(tenant.settings, tenant.name);
    const message = buildTenantCommunicationMessage({
      type,
      tenantName: branding.displayName,
      recipientName: recipient.name,
      currentPeriodEndsAt: tenant.currentPeriodEndsAt,
    });

    const delivery = await createEmailProvider().send({
      tenantId,
      to: recipient.email,
      subject: message.subject,
      text: message.text,
      html: renderBrandedEmail({
        branding,
        title: message.title,
        body: message.body,
        actionLabel: message.actionLabel,
        actionUrl: this.publicAppUrl("/login"),
        footerNote: message.footerNote,
      }),
    });

    await this.database.db.insert(auditLogs).values({
      tenantId,
      userId: context.userId,
      requestId: context.requestId,
      action: `platform.tenant.communication_${type}_queued`,
      entityType: "tenant",
      entityId: tenantId,
      metadata: {
        recipientEmail: recipient.email,
        provider: delivery.provider,
        messageId: delivery.messageId,
      },
    });

    return {
      tenantId,
      type,
      recipientEmail: recipient.email,
      provider: delivery.provider,
      queued: delivery.queued,
    };
  }

  private slugify(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
  }

  private temporaryPassword(slug: string) {
    return `Giro@${slug.slice(0, 8).padEnd(8, "0")}1`;
  }

  private publicAppUrl(path: string) {
    const baseUrl = process.env.APP_URL ?? "http://localhost:3002";
    return new URL(path, baseUrl).toString();
  }

  private async createAsaasCheckout(input: {
    apiKey: string;
    environment: "sandbox" | "production";
    baseUrl: string;
    tenantId: string;
    tenantName: string;
    planCode: string;
    priceCents: number;
    reference: string;
  }) {
    const callbackBase = this.publicAppUrl(`/platform/${input.tenantId}`);
    const response = await fetch(`${input.baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `GiroMesa/0.1 (${input.environment})`,
        access_token: input.apiKey,
      },
      body: JSON.stringify({
        billingTypes: ["PIX", "CREDIT_CARD"],
        chargeTypes: ["RECURRENT"],
        externalReference: input.reference,
        name: `Assinatura GiroMesa - ${input.tenantName}`,
        items: [
          {
            name: `Plano GiroMesa ${input.planCode}`,
            quantity: 1,
            value: Number((input.priceCents / 100).toFixed(2)),
          },
        ],
        callback: {
          successUrl: `${callbackBase}?asaas=success`,
          autoRedirect: true,
        },
        subscription: {
          cycle: "MONTHLY",
          value: Number((input.priceCents / 100).toFixed(2)),
          description: `Assinatura GiroMesa ${input.planCode}`,
          nextDueDate: nextDueDateIso(),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(
        `Asaas checkout failed with status ${response.status}: ${body.slice(0, 240)}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      checkoutUrl: readAsaasCheckoutUrl(payload),
      providerCheckoutId: readAsaasCheckoutId(payload),
    };
  }

  private healthFor(status: TenantStatus, branchCount: number, userCount: number) {
    if (status === "active") {
      return Math.min(98, 80 + branchCount * 4 + userCount);
    }
    if (status === "trial") {
      return 72;
    }
    if (status === "past_due") {
      return 58;
    }
    return 38;
  }

  private nextActionFor(status: TenantStatus) {
    const actions: Record<TenantStatus, string> = {
      trial: "Concluir onboarding e ativar assinatura",
      active: "Acompanhar saude e suporte",
      past_due: "Regularizar cobranca",
      suspended: "Reativar ou encerrar contrato",
      canceled: "Manter historico e bloquear acesso",
    };
    return actions[status];
  }

  private trialDaysRemaining(currentPeriodEndsAt: Date | null) {
    if (!currentPeriodEndsAt) {
      return null;
    }
    return Math.max(
      0,
      Math.ceil((currentPeriodEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
  }

  private billingStatusFor(status: TenantStatus, currentPeriodEndsAt: Date | null) {
    if (status === "past_due") {
      return "payment_required";
    }
    if (status === "suspended" || status === "canceled") {
      return "access_blocked";
    }
    if (status === "trial") {
      const daysRemaining = this.trialDaysRemaining(currentPeriodEndsAt);
      return daysRemaining !== null && daysRemaining <= 3 ? "trial_ending" : "trial_ok";
    }
    return "healthy";
  }

  private onboardingChecklistFor(
    status: TenantStatus,
    branchCount: number,
    userCount: number,
    hasPlan: boolean,
  ) {
    return [
      { key: "tenant_created", label: "Ambiente criado", done: true },
      { key: "branch_created", label: "Filial inicial cadastrada", done: branchCount > 0 },
      { key: "owner_created", label: "Administrador criado", done: userCount > 0 },
      { key: "plan_selected", label: "Plano definido", done: hasPlan },
      { key: "subscription_active", label: "Assinatura ativa", done: status === "active" },
    ];
  }
}

function renderPlatformInviteEmail(input: { branding: DocumentBranding; actionUrl: string }) {
  return renderBrandedEmail({
    branding: input.branding,
    title: "Seu ambiente foi criado",
    body: `Ative o acesso administrativo de ${input.branding.displayName} no GiroMesa.`,
    actionLabel: "Ativar acesso",
    actionUrl: input.actionUrl,
    footerNote:
      "Convite inicial do ambiente SaaS. Apos ativacao, a administracao pode configurar equipe, unidades e operacao.",
  });
}

function readCommercialNotes(settings: Record<string, unknown>) {
  const value = settings.commercialNotes;
  return typeof value === "string" ? value : "";
}

function readCommunicationType(action: string): "trial_ending" | "past_due" | "support_follow_up" {
  if (action.includes("communication_past_due")) {
    return "past_due";
  }
  if (action.includes("communication_support_follow_up")) {
    return "support_follow_up";
  }
  return "trial_ending";
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function readTenantBranding(
  settings: Record<string, unknown> | undefined,
  fallbackName: string,
): DocumentBranding {
  const rawBranding =
    settings && typeof settings.branding === "object" && settings.branding !== null
      ? (settings.branding as Record<string, unknown>)
      : {};
  const accentPreset = typeof rawBranding.accentPreset === "string" ? rawBranding.accentPreset : "";

  return {
    displayName:
      typeof rawBranding.displayName === "string" && rawBranding.displayName.trim()
        ? rawBranding.displayName.trim()
        : fallbackName,
    logoUrl:
      typeof rawBranding.logoUrl === "string" && rawBranding.logoUrl.trim()
        ? rawBranding.logoUrl.trim()
        : null,
    accentPreset:
      accentPreset === "blue" ||
      accentPreset === "amber" ||
      accentPreset === "rose" ||
      accentPreset === "violet"
        ? accentPreset
        : "emerald",
  };
}

function buildTenantCommunicationMessage(input: {
  type: "trial_ending" | "past_due" | "support_follow_up";
  tenantName: string;
  recipientName: string | null;
  currentPeriodEndsAt: Date | null;
}) {
  const greeting = input.recipientName?.trim() ? `${input.recipientName.trim()}, ` : "";
  const dueDate = input.currentPeriodEndsAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(input.currentPeriodEndsAt)
    : null;

  if (input.type === "trial_ending") {
    return {
      subject: `Seu trial do ${input.tenantName} esta acabando`,
      title: "Seu trial esta chegando ao fim",
      body: `${greeting}o ambiente ${input.tenantName} esta entrando nos ultimos dias de trial${dueDate ? ` e a janela atual vai ate ${dueDate}` : ""}. Vale revisar assinatura, equipe e operacao para evitar interrupcao.`,
      text: `${greeting}o trial do ambiente ${input.tenantName} esta acabando${dueDate ? ` em ${dueDate}` : ""}. Acesse o painel para concluir a ativacao da assinatura.`,
      actionLabel: "Abrir ambiente",
      footerNote:
        "Mensagem automatica de acompanhamento comercial para conversao de trial e continuidade operacional.",
    };
  }

  if (input.type === "past_due") {
    return {
      subject: `Regularize a assinatura do ${input.tenantName}`,
      title: "Assinatura com pendencia de cobranca",
      body: `${greeting}identificamos uma pendencia financeira ligada ao ambiente ${input.tenantName}. Recomendamos regularizar a cobranca para manter acesso, suporte e operacao sem bloqueios futuros.`,
      text: `${greeting}ha uma pendencia de cobranca na assinatura do ${input.tenantName}. Acesse o painel para regularizar.`,
      actionLabel: "Regularizar agora",
      footerNote:
        "Mensagem automatica de cobranca. Ajustes financeiros e fiscais seguem sob validacao operacional.",
    };
  }

  return {
    subject: `Acompanhamento do seu ambiente ${input.tenantName}`,
    title: "Seguimos acompanhando sua operacao",
    body: `${greeting}passando para acompanhar o andamento do ambiente ${input.tenantName}, tirar impedimentos e alinhar proximos passos de implantacao, suporte ou rotina comercial.`,
    text: `${greeting}seguimos acompanhando o ambiente ${input.tenantName}. Responda este email ou acesse o painel para alinhar os proximos passos.`,
    actionLabel: "Abrir ambiente",
    footerNote:
      "Mensagem automatica de follow-up comercial e operacional enviada pelo backoffice do GiroMesa.",
  };
}

function readSupportString(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function readSupportNullableString(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" ? value : null;
}

function readSupportPriority(
  settings: Record<string, unknown>,
  status: TenantStatus,
): SupportPriority {
  const value = settings.supportPriority;
  if (value === "high" || value === "normal") {
    return value;
  }
  return status === "past_due" || status === "suspended" ? "high" : "normal";
}

function readSlaTier(settings: Record<string, unknown>) {
  const value = settings.slaTier;
  return value === "priority" || value === "critical" ? value : "standard";
}

function readSupportStatus(settings: Record<string, unknown>) {
  const value = settings.supportStatus;
  return value === "in_progress" || value === "waiting_customer" || value === "resolved"
    ? value
    : "queued";
}

function buildSupportQueueLabel(settings: Record<string, unknown>, status: TenantStatus) {
  const supportStatus = readSupportStatus(settings);
  const nextFollowUpAt = readSupportNullableString(settings, "nextFollowUpAt");
  if (supportStatus === "resolved") {
    return "Resolvido";
  }
  if (status === "past_due") {
    return "Cobrar e acompanhar";
  }
  if (nextFollowUpAt) {
    return `Follow-up ${new Date(nextFollowUpAt).toLocaleDateString("pt-BR")}`;
  }
  if (supportStatus === "waiting_customer") {
    return "Aguardando cliente";
  }
  if (supportStatus === "in_progress") {
    return "Em atendimento";
  }
  return "Na fila";
}

function buildSupportAlertType(
  settings: Record<string, unknown>,
  status: TenantStatus,
  currentPeriodEndsAt: Date | null,
) {
  if (status === "past_due") {
    return "past_due";
  }
  const priority = readSupportPriority(settings, status);
  if (priority === "high") {
    return "high_priority";
  }
  const nextFollowUpAt = readSupportNullableString(settings, "nextFollowUpAt");
  if (nextFollowUpAt) {
    return "follow_up";
  }
  if (status === "trial" && currentPeriodEndsAt) {
    const daysRemaining = Math.ceil(
      (currentPeriodEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (daysRemaining <= 3) {
      return "trial_ending";
    }
  }
  return "none";
}

function readContactHistory(settings: Record<string, unknown>) {
  const value = settings.contactHistory;
  if (!Array.isArray(value)) {
    return [] as Array<{
      id: string;
      summary: string;
      createdAt: string;
      createdBy: string | null;
    }>;
  }
  return value
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).id === "string" &&
        typeof (entry as Record<string, unknown>).summary === "string" &&
        typeof (entry as Record<string, unknown>).createdAt === "string",
    )
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        id: record.id as string,
        summary: record.summary as string,
        createdAt: record.createdAt as string,
        createdBy: typeof record.createdBy === "string" ? record.createdBy : null,
      };
    });
}

function readAsaasNextStep(settings: Record<string, unknown>, fallback: string) {
  const checkout = settings.asaasLastCheckout;
  if (checkout && typeof checkout === "object" && !Array.isArray(checkout)) {
    const nextStep = (checkout as Record<string, unknown>).nextStep;
    if (typeof nextStep === "string" && nextStep.length > 0) {
      return nextStep;
    }
  }
  return fallback;
}

function readAsaasCheckoutUrl(payload: Record<string, unknown>) {
  const candidates = [
    payload.checkoutUrl,
    payload.url,
    payload.invoiceUrl,
    readNested(payload, "data.checkoutUrl"),
    readNested(payload, "data.url"),
    readNested(payload, "data.invoiceUrl"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return "";
}

function readAsaasCheckoutId(payload: Record<string, unknown>) {
  const candidates = [
    payload.id,
    readNested(payload, "data.id"),
    readNested(payload, "checkout.id"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function readNested(payload: Record<string, unknown>, path: string): unknown {
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function nextDueDateIso() {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  return due.toISOString().slice(0, 10);
}

function supportPriorityScore(tenant: {
  support?: {
    priority?: string;
    slaTier?: string;
  };
}) {
  const priority = tenant.support?.priority === "high" ? 3 : 1;
  const sla =
    tenant.support?.slaTier === "critical" ? 3 : tenant.support?.slaTier === "priority" ? 2 : 1;
  return priority + sla;
}
