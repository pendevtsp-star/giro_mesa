import { createHash } from "node:crypto";
import { branches, fiscalProviderCredentials } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { encryptSecret } from "../../common/secret-vault";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class FiscalCredentialsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async replace(
    context: TenantContext,
    input: { branchId: string; environment: "homologation" | "production"; token: string },
  ) {
    await this.assertBranch(context, input.branchId);
    const key = process.env.FISCAL_CREDENTIALS_ENCRYPTION_KEY;
    if (!key) throw new BadRequestException("Fiscal credential encryption is not configured");
    if (input.environment === "production" && process.env.FISCAL_PRODUCTION_ENABLED !== "true")
      throw new BadRequestException("Fiscal production is disabled");
    const token = input.token.trim();
    if (!token) throw new BadRequestException("Fiscal credential is required");
    const fingerprint = createHash("sha256").update(token).digest("hex");
    const values = {
      tokenEncrypted: encryptSecret(token, key),
      tokenFingerprint: fingerprint,
      tokenLastFour: token.slice(-4),
      status: "active",
      rotatedAt: new Date(),
      revokedAt: null,
      createdByUserId: context.userId,
      updatedAt: new Date(),
    } as const;
    const [credential] = await this.database.db
      .insert(fiscalProviderCredentials)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        provider: "focus_nfe",
        environment: input.environment,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          fiscalProviderCredentials.tenantId,
          fiscalProviderCredentials.branchId,
          fiscalProviderCredentials.provider,
          fiscalProviderCredentials.environment,
        ],
        set: values,
      })
      .returning();
    if (!credential) throw new Error("Failed to save fiscal credential");
    return {
      id: credential.id,
      branchId: credential.branchId,
      provider: credential.provider,
      environment: credential.environment,
      status: credential.status,
      tokenLastFour: credential.tokenLastFour,
      rotatedAt: credential.rotatedAt,
      revokedAt: credential.revokedAt,
      createdAt: credential.createdAt,
    };
  }

  async exists(
    context: TenantContext,
    branchId: string,
    environment: "homologation" | "production",
  ) {
    const [credential] = await this.database.db
      .select({ id: fiscalProviderCredentials.id })
      .from(fiscalProviderCredentials)
      .where(
        and(
          eq(fiscalProviderCredentials.tenantId, context.tenantId),
          eq(fiscalProviderCredentials.branchId, branchId),
          eq(fiscalProviderCredentials.provider, "focus_nfe"),
          eq(fiscalProviderCredentials.environment, environment),
          eq(fiscalProviderCredentials.status, "active"),
        ),
      )
      .limit(1);
    return Boolean(credential);
  }

  async list(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    return this.database.db
      .select({
        id: fiscalProviderCredentials.id,
        branchId: fiscalProviderCredentials.branchId,
        provider: fiscalProviderCredentials.provider,
        environment: fiscalProviderCredentials.environment,
        tokenFingerprint: fiscalProviderCredentials.tokenFingerprint,
        tokenLastFour: fiscalProviderCredentials.tokenLastFour,
        status: fiscalProviderCredentials.status,
        rotatedAt: fiscalProviderCredentials.rotatedAt,
        revokedAt: fiscalProviderCredentials.revokedAt,
        createdAt: fiscalProviderCredentials.createdAt,
      })
      .from(fiscalProviderCredentials)
      .where(
        and(
          eq(fiscalProviderCredentials.tenantId, context.tenantId),
          eq(fiscalProviderCredentials.branchId, branchId),
        ),
      );
  }

  async revoke(context: TenantContext, credentialId: string) {
    const now = new Date();
    const [credential] = await this.database.db
      .update(fiscalProviderCredentials)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(fiscalProviderCredentials.tenantId, context.tenantId),
          eq(fiscalProviderCredentials.id, credentialId),
        ),
      )
      .returning();
    if (!credential) throw new NotFoundException("Fiscal credential not found");
    return {
      id: credential.id,
      branchId: credential.branchId,
      environment: credential.environment,
      status: credential.status,
      revokedAt: credential.revokedAt,
    };
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
  }
}
