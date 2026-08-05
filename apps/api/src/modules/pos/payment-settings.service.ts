import { createHash, randomBytes } from "node:crypto";
import {
  auditLogs,
  branches,
  branchPaymentSettings,
  operationalDevices,
  tenantEntitlements,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export type PaymentSettingsInput = {
  profile: "external_terminal" | "smartpos" | "tef" | "hybrid";
  preferredMode: "manual" | "smartpos" | "tef";
  allowManualFallback: boolean;
  reconciliationMode: "manual" | "import" | "automatic";
  provider?: string | undefined;
  status: "disabled" | "active";
  expectedVersion: number;
};

@Injectable()
export class PaymentSettingsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async get(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    const [settings] = await this.database.db
      .select()
      .from(branchPaymentSettings)
      .where(
        and(
          eq(branchPaymentSettings.tenantId, context.tenantId),
          eq(branchPaymentSettings.branchId, branchId),
        ),
      )
      .limit(1);
    const entitlements = await this.entitlements(context);
    return {
      settings: settings ?? {
        branchId,
        profile: "external_terminal",
        preferredMode: "manual",
        allowManualFallback: true,
        reconciliationMode: "manual",
        status: "active",
        version: 1,
      },
      availability: {
        manual: true,
        import: true,
        smartpos: entitlements.has("payments.smartpos"),
        tef: entitlements.has("payments.tef"),
        automaticReconciliation: entitlements.has("payments.reconciliation.automatic"),
      },
    };
  }

  async update(context: TenantContext, branchId: string, input: PaymentSettingsInput) {
    await this.assertBranch(context, branchId);
    if (input.preferredMode === "smartpos") await this.assertEntitled(context, "payments.smartpos");
    if (input.preferredMode === "tef") await this.assertEntitled(context, "payments.tef");
    if (input.reconciliationMode === "automatic") {
      await this.assertEntitled(context, "payments.reconciliation.automatic");
      throw new BadRequestException(
        "Automatic reconciliation is unavailable until a provider is configured",
      );
    }
    const existing = await this.get(context, branchId);
    const persisted = "id" in existing.settings;
    const [settings] = persisted
      ? await this.database.db
          .update(branchPaymentSettings)
          .set({
            profile: input.profile,
            preferredMode: input.preferredMode,
            allowManualFallback: input.allowManualFallback,
            reconciliationMode: input.reconciliationMode,
            provider: input.provider?.trim() || null,
            status: input.status,
            version: input.expectedVersion + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(branchPaymentSettings.tenantId, context.tenantId),
              eq(branchPaymentSettings.branchId, branchId),
              eq(branchPaymentSettings.version, input.expectedVersion),
            ),
          )
          .returning()
      : await this.database.db
          .insert(branchPaymentSettings)
          .values({
            tenantId: context.tenantId,
            branchId,
            profile: input.profile,
            preferredMode: input.preferredMode,
            allowManualFallback: input.allowManualFallback,
            reconciliationMode: input.reconciliationMode,
            provider: input.provider?.trim() || null,
            status: input.status,
          })
          .returning();
    if (!settings) throw new ConflictException("Payment settings were updated concurrently");
    await this.audit(context, branchId, "payment.settings_updated", settings.id, {
      profile: input.profile,
      preferredMode: input.preferredMode,
      reconciliationMode: input.reconciliationMode,
    });
    return settings;
  }

  async listTerminals(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    return this.database.db
      .select({
        id: operationalDevices.id,
        branchId: operationalDevices.branchId,
        name: operationalDevices.name,
        status: operationalDevices.status,
        provider: operationalDevices.provider,
        providerTerminalId: operationalDevices.providerTerminalId,
        capabilities: operationalDevices.capabilities,
        pairedAt: operationalDevices.pairedAt,
        lastSeenAt: operationalDevices.lastSeenAt,
        version: operationalDevices.version,
      })
      .from(operationalDevices)
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.branchId, branchId),
          eq(operationalDevices.kind, "payment_terminal"),
        ),
      );
  }

  async createTerminal(
    context: TenantContext,
    input: {
      branchId: string;
      name: string;
      provider?: string | undefined;
      providerTerminalId?: string | undefined;
      capabilities: Record<string, unknown>;
    },
  ) {
    await this.assertBranch(context, input.branchId);
    if (!context.userId) throw new BadRequestException("Authenticated user is required");
    const pairingCode = randomBytes(18).toString("base64url");
    const [terminal] = await this.database.db
      .insert(operationalDevices)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name.trim(),
        kind: "payment_terminal",
        initialMode: "cashier",
        tokenHash: createHash("sha256").update(pairingCode).digest("hex"),
        provider: input.provider?.trim() || null,
        providerTerminalId: input.providerTerminalId?.trim() || null,
        capabilities: input.capabilities,
        pairedAt: new Date(),
        createdByUserId: context.userId,
      })
      .returning();
    if (!terminal) throw new Error("Failed to create payment terminal");
    await this.audit(context, input.branchId, "payment.terminal_created", terminal.id);
    return {
      id: terminal.id,
      branchId: terminal.branchId,
      name: terminal.name,
      status: terminal.status,
      provider: terminal.provider,
      capabilities: terminal.capabilities,
      pairedAt: terminal.pairedAt,
      ...(process.env.NODE_ENV === "production" ? {} : { localPairingCode: pairingCode }),
    };
  }

  async revokeTerminal(context: TenantContext, terminalId: string) {
    if (!context.userId) throw new BadRequestException("Authenticated user is required");
    const now = new Date();
    const [terminal] = await this.database.db
      .update(operationalDevices)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedByUserId: context.userId,
        version: sql`${operationalDevices.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.id, terminalId),
          eq(operationalDevices.kind, "payment_terminal"),
        ),
      )
      .returning();
    if (!terminal) throw new NotFoundException("Payment terminal not found");
    await this.audit(context, terminal.branchId, "payment.terminal_revoked", terminal.id);
    return { id: terminal.id, status: terminal.status, revokedAt: terminal.revokedAt };
  }

  async assertTerminal(context: TenantContext, branchId: string, terminalId: string) {
    const [terminal] = await this.database.db
      .select()
      .from(operationalDevices)
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.branchId, branchId),
          eq(operationalDevices.id, terminalId),
          eq(operationalDevices.kind, "payment_terminal"),
          eq(operationalDevices.status, "active"),
        ),
      )
      .limit(1);
    if (!terminal) throw new NotFoundException("Active payment terminal not found");
    return terminal;
  }

  private async entitlements(context: TenantContext) {
    const now = new Date();
    const rows = await this.database.db
      .select({ code: tenantEntitlements.code })
      .from(tenantEntitlements)
      .where(
        and(
          eq(tenantEntitlements.tenantId, context.tenantId),
          eq(tenantEntitlements.status, "active"),
          or(isNull(tenantEntitlements.expiresAt), gt(tenantEntitlements.expiresAt, now)),
        ),
      );
    return new Set(rows.map((row) => row.code));
  }

  private async assertEntitled(context: TenantContext, code: string) {
    if (!(await this.entitlements(context)).has(code)) {
      throw new BadRequestException(
        "This payment automation is not available for the current plan",
      );
    }
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch || (context.branchId && context.branchId !== branchId))
      throw new NotFoundException("Branch not found");
  }

  private async audit(
    context: TenantContext,
    branchId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType: "payment_configuration",
      entityId,
      metadata,
    });
  }
}
