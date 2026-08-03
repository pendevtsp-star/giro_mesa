import { randomUUID, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  branches,
  ecosystemCampaigns,
  federationHandoffs,
  subscriptions,
  tenantEntitlements,
  tenants,
  users,
} from "@giromesa/db";
import {
  commercialProductCatalog,
  type EcosystemEntitlementCode,
  entitlementsForProduct,
  type TenantContext,
} from "@giromesa/domain";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  type FederationClaims,
  signFederationToken,
  verifyFederationToken,
} from "../../common/federation-token";
import { DatabaseService } from "../database/database.service";

export type CreateEcosystemCampaignInput = {
  branchId?: string | undefined;
  sourceProduct: "giromesa" | "doseclub";
  targetProduct: "giromesa" | "doseclub";
  name: string;
  message: string;
  targetUrl: string;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
};

@Injectable()
export class EcosystemService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  getCommercialCatalog() {
    return {
      version: "2026-08-03",
      authority: "giromesa",
      products: commercialProductCatalog,
    };
  }

  async getEntitlements(tenantId: string) {
    const now = new Date();
    const [explicit, activeSubscriptions] = await Promise.all([
      this.database.db
        .select({ code: tenantEntitlements.code })
        .from(tenantEntitlements)
        .where(
          and(
            eq(tenantEntitlements.tenantId, tenantId),
            eq(tenantEntitlements.status, "active"),
            or(isNull(tenantEntitlements.expiresAt), gt(tenantEntitlements.expiresAt, now)),
          ),
        ),
      this.database.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.tenantId, tenantId),
            inArray(subscriptions.status, ["trial", "active"]),
            or(
              isNull(subscriptions.currentPeriodEndsAt),
              gt(subscriptions.currentPeriodEndsAt, now),
            ),
          ),
        )
        .limit(1),
    ]);

    const effective = new Set(explicit.map((item) => item.code));
    if (activeSubscriptions.length) {
      effective.add("giromesa.subscription");
    }
    if (effective.has("bundle")) {
      for (const code of entitlementsForProduct("bundle")) {
        effective.add(code);
      }
    }
    return [...effective].sort();
  }

  async replaceTenantEntitlements(
    context: TenantContext,
    tenantId: string,
    input: { grant: EcosystemEntitlementCode[]; revoke: EcosystemEntitlementCode[] },
  ) {
    const [tenant] = await this.database.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    await this.database.db.transaction(async (tx) => {
      for (const code of new Set(input.grant)) {
        await tx
          .insert(tenantEntitlements)
          .values({ tenantId, code, status: "active", source: "platform" })
          .onConflictDoUpdate({
            target: [tenantEntitlements.tenantId, tenantEntitlements.code],
            set: { status: "active", source: "platform", expiresAt: null, updatedAt: new Date() },
          });
      }
      if (input.revoke.length) {
        await tx
          .update(tenantEntitlements)
          .set({ status: "revoked", updatedAt: new Date() })
          .where(
            and(
              eq(tenantEntitlements.tenantId, tenantId),
              inArray(tenantEntitlements.code, [...new Set(input.revoke)]),
            ),
          );
      }
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "ecosystem.entitlements_updated",
        entityType: "tenant",
        entityId: tenantId,
        metadata: { grant: input.grant, revoke: input.revoke },
      });
    });

    return { tenantId, entitlements: await this.getEntitlements(tenantId) };
  }

  async createCampaign(context: TenantContext, input: CreateEcosystemCampaignInput) {
    if (input.sourceProduct === input.targetProduct) {
      throw new ConflictException("Cross-product campaigns require distinct products");
    }
    if (!isAllowedEcosystemCampaignTarget(input.targetProduct, input.targetUrl)) {
      throw new ForbiddenException("Campaign target must use the official product domain");
    }
    if (input.branchId) {
      const [branch] = await this.database.db
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, input.branchId)))
        .limit(1);
      if (!branch) {
        throw new NotFoundException("Branch not found");
      }
    }

    const [campaign] = await this.database.db
      .insert(ecosystemCampaigns)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        sourceProduct: input.sourceProduct,
        targetProduct: input.targetProduct,
        name: input.name,
        message: input.message,
        targetUrl: input.targetUrl,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      })
      .returning();
    if (!campaign) {
      throw new Error("Failed to create ecosystem campaign");
    }
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId ?? context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "ecosystem.campaign_created",
      entityType: "ecosystem_campaign",
      entityId: campaign.id,
      metadata: { sourceProduct: input.sourceProduct, targetProduct: input.targetProduct },
    });
    return campaign;
  }

  async listCampaigns(context: TenantContext) {
    return this.database.db
      .select()
      .from(ecosystemCampaigns)
      .where(eq(ecosystemCampaigns.tenantId, context.tenantId))
      .orderBy(desc(ecosystemCampaigns.createdAt));
  }

  async updateCampaignStatus(
    context: TenantContext,
    campaignId: string,
    status: "draft" | "active" | "paused" | "ended",
  ) {
    const [campaign] = await this.database.db
      .update(ecosystemCampaigns)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(ecosystemCampaigns.tenantId, context.tenantId),
          eq(ecosystemCampaigns.id, campaignId),
        ),
      )
      .returning();
    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: campaign.branchId ?? context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "ecosystem.campaign_status_updated",
      entityType: "ecosystem_campaign",
      entityId: campaign.id,
      metadata: { status },
    });
    return campaign;
  }

  async createFederationHandoff(
    context: TenantContext,
    input: { targetProduct: "doseclub"; returnTo?: string | undefined },
  ) {
    const userId = context.userId;
    if (!userId || context.tenantId === "platform") {
      throw new UnauthorizedException("A tenant session is required");
    }
    const entitlements = await this.getEntitlements(context.tenantId);
    if (!entitlements.includes("doseclub.subscription") && !entitlements.includes("bundle")) {
      throw new ForbiddenException("Dose Club access is not enabled for this tenant");
    }
    const [identity] = await this.database.db
      .select({
        userId: users.id,
        tenantId: tenants.id,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.id, userId), eq(tenants.id, context.tenantId)))
      .limit(1);
    if (!identity) {
      throw new UnauthorizedException("Federated identity not found");
    }

    const env = loadEnv();
    assertFederationConfigured(env);
    const now = Math.floor(Date.now() / 1_000);
    const expiresAt = new Date((now + 60) * 1_000);
    const jti = randomUUID();
    const claims: FederationClaims = {
      iss: env.FEDERATION_ISSUER_URL,
      aud: "doseclub",
      sub: identity.userId,
      tenant_id: identity.tenantId,
      source_product: "giromesa",
      target_product: input.targetProduct,
      jti,
      iat: now,
      exp: now + 60,
      ...(context.branchId ? { branch_id: context.branchId } : {}),
      ...(input.returnTo ? { return_to: input.returnTo } : {}),
    };
    const token = signFederationToken(claims, env.FEDERATION_HANDOFF_SECRET);
    await this.database.db.transaction(async (tx) => {
      await tx.insert(federationHandoffs).values({
        id: jti,
        tenantId: context.tenantId,
        userId,
        targetProduct: input.targetProduct,
        audience: claims.aud,
        expiresAt,
        metadata: { returnTo: input.returnTo ?? null, branchId: context.branchId ?? null },
      });
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "auth.federation_handoff_created",
        entityType: "federation_handoff",
        entityId: jti,
        metadata: { targetProduct: input.targetProduct, expiresAt: expiresAt.toISOString() },
      });
    });

    const targetUrl = new URL("/login", env.DOSECLUB_PUBLIC_URL);
    targetUrl.searchParams.set("federation_token", token);
    return { token, expiresAt: expiresAt.toISOString(), targetUrl: targetUrl.toString() };
  }

  async exchangeFederationHandoff(token: string, exchangeKey: string | undefined) {
    const env = loadEnv();
    assertFederationConfigured(env);
    if (!safeEqual(exchangeKey, env.DOSECLUB_SSO_EXCHANGE_KEY)) {
      throw new UnauthorizedException("Invalid product exchange credentials");
    }

    let claims: FederationClaims;
    try {
      claims = verifyFederationToken(token, {
        secret: env.FEDERATION_HANDOFF_SECRET,
        issuer: env.FEDERATION_ISSUER_URL,
        audience: "doseclub",
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired federation token");
    }

    const [consumed] = await this.database.db
      .update(federationHandoffs)
      .set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(federationHandoffs.id, claims.jti),
          eq(federationHandoffs.tenantId, claims.tenant_id),
          eq(federationHandoffs.userId, claims.sub),
          eq(federationHandoffs.audience, claims.aud),
          isNull(federationHandoffs.consumedAt),
          gt(federationHandoffs.expiresAt, new Date()),
        ),
      )
      .returning({ id: federationHandoffs.id });
    if (!consumed) {
      throw new ConflictException("Federation token was already consumed or expired");
    }

    const entitlements = await this.getEntitlements(claims.tenant_id);
    if (!entitlements.includes("doseclub.subscription") && !entitlements.includes("bundle")) {
      throw new ForbiddenException("Dose Club access is no longer enabled for this tenant");
    }
    const [identity] = await this.database.db
      .select({
        email: users.email,
        name: users.name,
        tenantSlug: tenants.slug,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.id, claims.sub), eq(tenants.id, claims.tenant_id)))
      .limit(1);
    if (!identity) {
      throw new UnauthorizedException("Federated identity no longer exists");
    }
    await this.database.db.insert(auditLogs).values({
      tenantId: claims.tenant_id,
      userId: claims.sub,
      requestId: `federation-${claims.jti}`,
      action: "auth.federation_handoff_consumed",
      entityType: "federation_handoff",
      entityId: claims.jti,
      metadata: { targetProduct: claims.target_product },
    });
    return {
      identity: {
        ...claims,
        tenant_slug: identity.tenantSlug,
        email: identity.email,
        name: identity.name,
        entitlements,
      },
    };
  }
}

export function isAllowedEcosystemCampaignTarget(product: "giromesa" | "doseclub", value: string) {
  try {
    const env = loadEnv();
    const expected = product === "doseclub" ? env.DOSECLUB_PUBLIC_URL : env.PUBLIC_APP_URL;
    return new URL(value).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

function safeEqual(left: string | undefined, right: string) {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function assertFederationConfigured(env: ReturnType<typeof loadEnv>) {
  if (
    env.NODE_ENV === "production" &&
    (env.FEDERATION_HANDOFF_SECRET.length < 32 ||
      env.DOSECLUB_SSO_EXCHANGE_KEY.length < 32 ||
      env.FEDERATION_HANDOFF_SECRET.startsWith("local-development-") ||
      env.DOSECLUB_SSO_EXCHANGE_KEY.startsWith("local-development-"))
  ) {
    throw new ServiceUnavailableException("Federated identity is not configured");
  }
}
