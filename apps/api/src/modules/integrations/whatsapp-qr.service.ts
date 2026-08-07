import { auditLogs, branches, integrationAccounts } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, like } from "drizzle-orm";
import { createIntegrationApiKey, hashIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";

const providerPrefix = "whatsapp_qr_connector:";
const scopes = ["whatsapp:status", "whatsapp:send"] as const;

export type WhatsappQrStatus = "connecting" | "open" | "closed" | "logged_out" | "not_paired";

export type WhatsappQrHeartbeat = {
  version: string;
  status: Exclude<WhatsappQrStatus, "not_paired">;
  qr?: string | undefined;
  phone?: string | undefined;
};

@Injectable()
export class WhatsappQrService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async configure(
    context: TenantContext,
    input: { branchId: string; rotateKey?: boolean | undefined },
  ) {
    await this.assertBranch(context, input.branchId);
    const provider = providerForBranch(input.branchId);
    const [existing] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, provider),
        ),
      )
      .limit(1);

    const issued =
      !existing?.apiKeyHash || input.rotateKey ? createIntegrationApiKey(provider) : undefined;
    const config = {
      branchId: input.branchId,
      scopes: [...scopes],
      unofficial: true,
      status: existing?.config.status ?? "not_paired",
      disclaimer: "Conector não oficial; sujeito aos termos e limites do WhatsApp.",
    };
    const [account] = await this.database.db
      .insert(integrationAccounts)
      .values({
        tenantId: context.tenantId,
        provider,
        status: "active",
        config,
        secretRef: "GIROMESA_WHATSAPP_CONNECTOR_KEY",
        apiKeyHash: issued?.tokenHash,
        apiKeyLastFour: issued?.lastFour,
        apiKeyCreatedAt: issued ? new Date() : undefined,
      })
      .onConflictDoUpdate({
        target: [integrationAccounts.tenantId, integrationAccounts.provider],
        set: {
          status: "active",
          config,
          ...(issued
            ? {
                apiKeyHash: issued.tokenHash,
                apiKeyLastFour: issued.lastFour,
                apiKeyCreatedAt: new Date(),
              }
            : {}),
        },
      })
      .returning({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
        lastSyncAt: integrationAccounts.lastSyncAt,
      });

    if (!account) throw new Error("Falha ao configurar conector WhatsApp");
    await this.audit(
      context,
      issued ? "whatsapp.connector_key_rotated" : "whatsapp.connector_configured",
      account.id,
      {
        branchId: input.branchId,
        keyLastFour: issued?.lastFour ?? account.apiKeyLastFour,
        unofficial: true,
      },
    );
    return { ...this.map(account), apiKey: issued?.token, apiKeyReturnedOnce: Boolean(issued) };
  }

  async status(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    const [account] = await this.database.db
      .select({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
        lastSyncAt: integrationAccounts.lastSyncAt,
      })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, providerForBranch(branchId)),
        ),
      )
      .limit(1);
    return account
      ? this.map(account)
      : {
          provider: providerForBranch(branchId),
          status: "not_configured",
          branchId,
          hasApiKey: false,
          unofficial: true,
        };
  }

  async heartbeat(context: TenantContext, input: WhatsappQrHeartbeat) {
    if (!context.branchId)
      throw new ConflictException("O conector precisa estar vinculado a uma filial");
    const provider = providerForBranch(context.branchId);
    const [account] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, provider),
          eq(integrationAccounts.status, "active"),
        ),
      )
      .limit(1);
    if (!account) throw new NotFoundException("Conector WhatsApp não configurado");
    const nextConfig = {
      ...account.config,
      status: input.status,
      ...(input.qr ? { qr: input.qr } : input.status === "open" ? { qr: undefined } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      lastHeartbeat: { at: new Date().toISOString(), version: input.version },
    };
    await this.database.db
      .update(integrationAccounts)
      .set({ config: nextConfig, lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(integrationAccounts.id, account.id));
    return { accepted: true, status: input.status, unofficial: true };
  }

  async revoke(context: TenantContext, branchId: string) {
    await this.assertBranch(context, branchId);
    const [account] = await this.database.db
      .update(integrationAccounts)
      .set({ status: "disabled", apiKeyHash: null, apiKeyLastFour: null, updatedAt: new Date() })
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, providerForBranch(branchId)),
        ),
      )
      .returning({ id: integrationAccounts.id, provider: integrationAccounts.provider });
    if (!account) throw new NotFoundException("Conector WhatsApp não configurado");
    await this.audit(context, "whatsapp.connector_revoked", account.id, {
      branchId,
      unofficial: true,
    });
    return { provider: account.provider, status: "disabled", branchId, unofficial: true };
  }

  async resolveConnector(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<TenantContext> {
    const raw = headers["x-giromesa-connector-key"];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) throw new UnauthorizedException("Chave do conector ausente");
    const [account] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          like(integrationAccounts.provider, `${providerPrefix}%`),
          eq(integrationAccounts.status, "active"),
          eq(integrationAccounts.apiKeyHash, hashIntegrationApiKey(key)),
        ),
      )
      .limit(1);
    if (!account) throw new UnauthorizedException("Chave do conector inválida");
    const branchId = readString(account.config.branchId);
    if (!branchId || !readStringArray(account.config.scopes).includes("whatsapp:send")) {
      throw new UnauthorizedException("Conector WhatsApp sem escopo válido");
    }
    return {
      tenantId: account.tenantId,
      branchId,
      requestId: "whatsapp-connector",
      permissions: ["whatsapp:send", "whatsapp:status"],
    };
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.tenantId, context.tenantId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Filial não encontrada");
  }

  private map(account: {
    provider: string;
    status: string;
    config: Record<string, unknown>;
    apiKeyLastFour: string | null;
    apiKeyCreatedAt: Date | null;
    lastSyncAt: Date | null;
  }) {
    return {
      provider: account.provider,
      status: account.status,
      branchId: readString(account.config.branchId),
      connection: readString(account.config.status) ?? "not_paired",
      qr: readString(account.config.qr),
      phone: readString(account.config.phone),
      lastHeartbeat: account.config.lastHeartbeat ?? null,
      apiKeyLastFour: account.apiKeyLastFour,
      apiKeyCreatedAt: account.apiKeyCreatedAt,
      lastSyncAt: account.lastSyncAt,
      hasApiKey: Boolean(account.apiKeyLastFour),
      unofficial: true,
      disclaimer: "Conector não oficial da Meta; use somente após homologação e aceite de risco.",
    };
  }

  private async audit(
    context: TenantContext,
    action: string,
    id: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId:
        context.branchId ?? (typeof metadata.branchId === "string" ? metadata.branchId : null),
      userId: null,
      requestId: context.requestId,
      entityType: "integration_account",
      entityId: id,
      action,
      metadata,
    });
  }
}

function providerForBranch(branchId: string) {
  return `${providerPrefix}${branchId}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
