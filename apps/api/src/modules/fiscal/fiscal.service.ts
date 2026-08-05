import {
  auditLogs,
  branches,
  fiscalCertificates,
  fiscalDocuments,
  fiscalOperations,
  fiscalProviderCredentials,
  fiscalSettings,
  orderItems,
  orders,
  outboxEvents,
  payments,
  products,
} from "@giromesa/db";
import { type FiscalStatus, fiscalStatuses, type TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { summarizeNetChargeAllocations } from "../../common/payment-ledger";
import { DatabaseService } from "../database/database.service";
import { buildFocusNfeNfcePayload } from "./focus-nfe.mapper";

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

export type FiscalSettingsInput = {
  branchId: string;
  provider: string;
  status: string;
  environment: "homologation" | "production";
  defaultModel: "nfce" | "nfe" | "nfse";
  legalName?: string | undefined;
  tradeName?: string | undefined;
  document?: string | undefined;
  stateRegistration?: string | undefined;
  municipalRegistration?: string | undefined;
  taxRegime: string;
  uf?: string | undefined;
  cityCode?: string | undefined;
  cityName?: string | undefined;
  series: string;
  certificateSecretRef?: string | undefined;
  cscSecretRef?: string | undefined;
  config?: Record<string, unknown> | undefined;
};

export type FiscalListFilter = {
  status?: string | undefined;
  branchId?: string | undefined;
};

export type FiscalUsageSettingsInput = {
  branchId: string;
  monthlyAllowance: number | null;
  alertAtPercent: number;
};

@Injectable()
export class FiscalService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listDocuments(context: TenantContext, filter: FiscalListFilter) {
    const conditions: SQL<unknown>[] = [eq(fiscalDocuments.tenantId, context.tenantId)];
    if (filter.branchId) {
      conditions.push(eq(fiscalDocuments.branchId, filter.branchId));
    }
    if (filter.status) {
      if (!fiscalStatuses.includes(filter.status as FiscalStatus)) {
        throw new BadRequestException("Invalid fiscal status");
      }
      conditions.push(eq(fiscalDocuments.status, filter.status as FiscalStatus));
    }

    return this.database.db
      .select({
        id: fiscalDocuments.id,
        tenantId: fiscalDocuments.tenantId,
        branchId: fiscalDocuments.branchId,
        orderId: fiscalDocuments.orderId,
        provider: fiscalDocuments.provider,
        model: fiscalDocuments.model,
        environment: fiscalDocuments.environment,
        series: fiscalDocuments.series,
        number: fiscalDocuments.number,
        status: fiscalDocuments.status,
        accessKey: fiscalDocuments.accessKey,
        xmlUrl: fiscalDocuments.xmlUrl,
        danfeUrl: fiscalDocuments.danfeUrl,
        errorMessage: fiscalDocuments.errorMessage,
        issuedAt: fiscalDocuments.issuedAt,
        canceledAt: fiscalDocuments.canceledAt,
        createdAt: fiscalDocuments.createdAt,
        orderTotalCents: orders.totalCents,
      })
      .from(fiscalDocuments)
      .leftJoin(
        orders,
        and(eq(orders.tenantId, fiscalDocuments.tenantId), eq(orders.id, fiscalDocuments.orderId)),
      )
      .where(and(...conditions))
      .orderBy(desc(fiscalDocuments.createdAt))
      .limit(100);
  }

  async getDocument(context: TenantContext, documentId: string) {
    const [document] = await this.database.db
      .select()
      .from(fiscalDocuments)
      .where(
        and(eq(fiscalDocuments.tenantId, context.tenantId), eq(fiscalDocuments.id, documentId)),
      )
      .limit(1);

    if (!document) {
      throw new NotFoundException("Fiscal document not found");
    }

    return document;
  }

  async getSettings(context: TenantContext, branchId: string) {
    await this.assertBranchOwnership(context, branchId);
    const [settings] = await this.database.db
      .select()
      .from(fiscalSettings)
      .where(
        and(eq(fiscalSettings.tenantId, context.tenantId), eq(fiscalSettings.branchId, branchId)),
      )
      .limit(1);

    return (
      settings ?? {
        provider: "mock",
        status: "not_configured",
        environment: "homologation",
        defaultModel: "nfce",
        branchId,
        config: {},
      }
    );
  }

  async getUsage(context: TenantContext, branchId: string, period: string) {
    await this.assertBranchOwnership(context, branchId);
    const { start, end } = fiscalMonthRange(period);
    const [settings, rows, issuedRows] = await Promise.all([
      this.getSettings(context, branchId),
      this.database.db
        .select({ status: fiscalDocuments.status, total: count(fiscalDocuments.id) })
        .from(fiscalDocuments)
        .where(
          and(
            eq(fiscalDocuments.tenantId, context.tenantId),
            eq(fiscalDocuments.branchId, branchId),
            eq(fiscalDocuments.model, "nfce"),
            gte(fiscalDocuments.createdAt, start),
            lt(fiscalDocuments.createdAt, end),
          ),
        )
        .groupBy(fiscalDocuments.status),
      this.database.db
        .select({ status: fiscalDocuments.status, total: count(fiscalDocuments.id) })
        .from(fiscalDocuments)
        .where(
          and(
            eq(fiscalDocuments.tenantId, context.tenantId),
            eq(fiscalDocuments.branchId, branchId),
            eq(fiscalDocuments.model, "nfce"),
            inArray(fiscalDocuments.status, ["authorized", "canceled"]),
            gte(fiscalDocuments.issuedAt, start),
            lt(fiscalDocuments.issuedAt, end),
          ),
        )
        .groupBy(fiscalDocuments.status),
    ]);
    const byStatus = Object.fromEntries(fiscalStatuses.map((status) => [status, 0])) as Record<
      FiscalStatus,
      number
    >;
    for (const row of rows) byStatus[row.status] = Number(row.total);

    const usageSettings = readFiscalUsageSettings(settings.config);
    const issuedDocuments = issuedRows.reduce((total, row) => total + Number(row.total), 0);
    const allowance = usageSettings.monthlyAllowance;
    const threshold = allowance
      ? Math.max(1, Math.ceil((allowance * usageSettings.alertAtPercent) / 100))
      : null;
    const alert =
      allowance === null
        ? "not_configured"
        : issuedDocuments > allowance
          ? "exceeded"
          : issuedDocuments >= (threshold ?? allowance)
            ? "approaching"
            : "ok";

    return {
      branchId,
      period,
      startsAt: start.toISOString(),
      endsAtExclusive: end.toISOString(),
      documentsCreated: Object.values(byStatus).reduce((total, value) => total + value, 0),
      issuedDocuments,
      byStatus,
      monthlyAllowance: allowance,
      alertAtPercent: usageSettings.alertAtPercent,
      remaining: allowance === null ? null : Math.max(0, allowance - issuedDocuments),
      exceededBy: allowance === null ? 0 : Math.max(0, issuedDocuments - allowance),
      alert,
      chargingEnabled: false,
      enforcementEnabled: false,
    } as const;
  }

  async updateUsageSettings(context: TenantContext, input: FiscalUsageSettingsInput) {
    await this.assertBranchOwnership(context, input.branchId);
    const metering = {
      monthlyAllowance: input.monthlyAllowance,
      alertAtPercent: input.alertAtPercent,
    };

    return this.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(fiscalSettings)
        .where(
          and(
            eq(fiscalSettings.tenantId, context.tenantId),
            eq(fiscalSettings.branchId, input.branchId),
          ),
        )
        .limit(1)
        .for("update");
      const config = { ...(current?.config ?? {}), usageMetering: metering };
      const [saved] = current
        ? await tx
            .update(fiscalSettings)
            .set({ config, version: current.version + 1, updatedAt: new Date() })
            .where(eq(fiscalSettings.id, current.id))
            .returning()
        : await tx
            .insert(fiscalSettings)
            .values({
              tenantId: context.tenantId,
              branchId: input.branchId,
              provider: "mock",
              status: "disabled",
              environment: "homologation",
              defaultModel: "nfce",
              config,
            })
            .returning();
      if (!saved) throw new Error("Failed to save fiscal usage settings");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "fiscal.usage_settings_updated",
        entityType: "fiscal_settings",
        entityId: saved.id,
        metadata: metering,
      });
      return { branchId: input.branchId, ...metering, version: saved.version };
    });
  }

  async upsertSettings(context: TenantContext, input: FiscalSettingsInput) {
    await this.assertBranchOwnership(context, input.branchId);
    if (input.environment === "production") {
      throw new BadRequestException(
        "Fiscal production can only be enabled through the audited production gate",
      );
    }
    const [settings] = await this.database.db
      .insert(fiscalSettings)
      .values({
        tenantId: context.tenantId,
        ...input,
        config: input.config ?? {},
      })
      .onConflictDoUpdate({
        target: [fiscalSettings.tenantId, fiscalSettings.branchId],
        set: {
          provider: input.provider,
          status: input.status,
          environment: input.environment,
          defaultModel: input.defaultModel,
          legalName: input.legalName,
          tradeName: input.tradeName,
          document: input.document,
          stateRegistration: input.stateRegistration,
          municipalRegistration: input.municipalRegistration,
          taxRegime: input.taxRegime,
          uf: input.uf,
          cityCode: input.cityCode,
          cityName: input.cityName,
          series: input.series,
          certificateSecretRef: input.certificateSecretRef,
          cscSecretRef: input.cscSecretRef,
          config: input.config ?? {},
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!settings) {
      throw new Error("Failed to upsert fiscal settings");
    }

    await this.audit(context, {
      branchId: input.branchId,
      action: "fiscal.settings_upserted",
      entityType: "fiscal_settings",
      entityId: settings.id,
      metadata: { provider: input.provider, environment: input.environment },
    });

    return settings;
  }

  async issueOrderDocument(
    context: TenantContext,
    orderId: string,
    input: { model?: "nfce" | "nfe" | "nfse" | undefined } = {},
  ) {
    return this.createPendingOrderDocument(context, orderId, input.model);
  }

  async createPendingOrderDocument(
    context: TenantContext,
    orderId: string,
    requestedModel?: "nfce" | "nfe" | "nfse" | undefined,
  ) {
    return this.database.db.transaction((tx) =>
      this.createPendingOrderDocumentInTransaction(context, orderId, requestedModel, tx),
    );
  }

  async createPendingOrderDocumentInTransaction(
    context: TenantContext,
    orderId: string,
    requestedModel: "nfce" | "nfe" | "nfse" | undefined,
    tx: TransactionClient,
  ) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
      .limit(1);

    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (!["paid", "refunded"].includes(order.status)) {
      throw new BadRequestException("Order must be paid before fiscal issue");
    }

    const [settings] = await tx
      .select()
      .from(fiscalSettings)
      .where(
        and(
          eq(fiscalSettings.tenantId, context.tenantId),
          eq(fiscalSettings.branchId, order.branchId),
        ),
      )
      .limit(1);

    const resolvedSettings =
      settings ??
      (
        await tx
          .insert(fiscalSettings)
          .values({
            tenantId: context.tenantId,
            branchId: order.branchId,
            provider: "mock",
            status: "disabled",
            environment: "homologation",
            defaultModel: "nfce",
            series: "1",
            nextNumber: 1,
            config: { autoCreated: true },
          })
          .returning()
      )[0];

    if (resolvedSettings?.status !== "enabled") {
      throw new BadRequestException("Fiscal settings are not enabled for this branch");
    }

    if (resolvedSettings.provider !== "focus_nfe") {
      throw new BadRequestException("Fiscal provider is not configured for this branch");
    }

    const simulator = resolvedSettings.providerMetadata?.simulator === true;
    if (simulator && process.env.NODE_ENV === "production") {
      throw new BadRequestException("Fiscal simulator is disabled in production");
    }
    if (!simulator) {
      const [credential] = await tx
        .select({ id: fiscalProviderCredentials.id })
        .from(fiscalProviderCredentials)
        .where(
          and(
            eq(fiscalProviderCredentials.tenantId, context.tenantId),
            eq(fiscalProviderCredentials.branchId, order.branchId),
            eq(fiscalProviderCredentials.provider, "focus_nfe"),
            eq(fiscalProviderCredentials.environment, resolvedSettings.environment),
            eq(fiscalProviderCredentials.status, "active"),
          ),
        )
        .limit(1);
      if (!credential) throw new BadRequestException("Active fiscal credential is required");
    }
    if (
      resolvedSettings.environment === "production" &&
      (process.env.FISCAL_PRODUCTION_ENABLED !== "true" ||
        !resolvedSettings.productionEnabledAt ||
        resolvedSettings.onboardingStatus !== "ready_for_production")
    ) {
      throw new BadRequestException("Fiscal production gates are incomplete");
    }

    if (resolvedSettings.environment === "production" && !resolvedSettings.certificateSecretRef) {
      throw new BadRequestException(
        "Certificate is required for production environment. Please upload a certificate first.",
      );
    }

    const model = requestedModel ?? (resolvedSettings.defaultModel as "nfce" | "nfe" | "nfse");
    const items = await tx
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        nameSnapshot: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        totalCents: orderItems.totalCents,
        fiscalNcm: products.fiscalNcm,
        fiscalCfop: products.fiscalCfop,
        fiscalCest: products.fiscalCest,
        fiscalOrigin: products.fiscalOrigin,
        fiscalCst: products.fiscalCst,
        fiscalCsosn: products.fiscalCsosn,
        fiscalIcmsRate: products.fiscalIcmsRate,
        fiscalPisRate: products.fiscalPisRate,
        fiscalCofinsRate: products.fiscalCofinsRate,
      })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(and(eq(orderItems.tenantId, context.tenantId), eq(orderItems.orderId, orderId)));

    const orderPayments = await tx
      .select({
        id: payments.id,
        method: payments.method,
        amountCents: payments.amountCents,
        provider: payments.provider,
        status: payments.status,
        paymentType: payments.paymentType,
        originalPaymentId: payments.originalPaymentId,
      })
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.orderId, orderId)));

    const netPaymentSummary = summarizeNetChargeAllocations(orderPayments);
    if (netPaymentSummary.totalCents < order.totalCents) {
      throw new BadRequestException(
        "Net payment after refunds does not cover the original sale. Adjust the order or cancel the authorized fiscal document before issuing again.",
      );
    }

    const [existing] = await tx
      .select()
      .from(fiscalDocuments)
      .where(
        and(
          eq(fiscalDocuments.tenantId, context.tenantId),
          eq(fiscalDocuments.orderId, order.id),
          eq(fiscalDocuments.model, model),
        ),
      )
      .limit(1);

    if (existing?.status === "authorized") {
      return { ...existing, queued: false };
    }

    const documentNumber = existing?.number ?? resolvedSettings.nextNumber;
    const payload = {
      order: {
        id: order.id,
        branchId: order.branchId,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        serviceChargeCents: order.serviceChargeCents,
        deliveryFeeCents: order.deliveryFeeCents,
        totalCents: order.totalCents,
        channel: order.channel,
      },
      items,
      payments: orderPayments,
      issuer: {
        legalName: resolvedSettings.legalName,
        tradeName: resolvedSettings.tradeName,
        document: resolvedSettings.document,
        stateRegistration: resolvedSettings.stateRegistration,
        municipalRegistration: resolvedSettings.municipalRegistration,
        uf: resolvedSettings.uf,
        cityCode: resolvedSettings.cityCode,
        cityName: resolvedSettings.cityName,
        taxRegime: resolvedSettings.taxRegime,
      },
      focusNfePayload:
        model === "nfce"
          ? buildFocusNfeNfcePayload({
              fiscalDocumentId: order.id,
              model,
              number: documentNumber,
              order: {
                id: order.id,
                branchId: order.branchId,
                channel: order.channel,
                subtotalCents: order.subtotalCents,
                discountCents: order.discountCents,
                serviceChargeCents: order.serviceChargeCents,
                deliveryFeeCents: order.deliveryFeeCents,
                totalCents: order.totalCents,
              },
              settings: resolvedSettings,
              items,
              payments: orderPayments,
            })
          : undefined,
    };

    const [document] = existing
      ? await tx
          .update(fiscalDocuments)
          .set({
            status: "pending",
            errorMessage: null,
            payload,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(fiscalDocuments.tenantId, context.tenantId),
              eq(fiscalDocuments.id, existing.id),
            ),
          )
          .returning()
      : await tx
          .insert(fiscalDocuments)
          .values({
            tenantId: context.tenantId,
            branchId: order.branchId,
            orderId: order.id,
            provider: resolvedSettings.provider,
            model,
            environment: resolvedSettings.environment,
            series: resolvedSettings.series,
            number: documentNumber,
            status: "pending",
            payload,
          })
          .returning();

    if (!document) {
      throw new Error("Failed to create fiscal document");
    }

    const idempotencyKey = `fiscal:issue:${document.id}`;
    await tx
      .insert(fiscalOperations)
      .values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        fiscalDocumentId: document.id,
        type: "issue",
        environment: resolvedSettings.environment,
        idempotencyKey,
        providerReference: document.id.replaceAll("-", ""),
        status: "pending",
      })
      .onConflictDoNothing({
        target: [fiscalOperations.tenantId, fiscalOperations.idempotencyKey, fiscalOperations.type],
      });
    await tx
      .insert(outboxEvents)
      .values({
        tenantId: context.tenantId,
        topic: "fiscal.operation.pending",
        payload: { fiscalDocumentId: document.id, operationType: "issue", idempotencyKey },
        idempotencyKey: `outbox:${idempotencyKey}`,
      })
      .onConflictDoNothing();

    if (!existing) {
      await tx
        .update(fiscalSettings)
        .set({ nextNumber: resolvedSettings.nextNumber + 1, updatedAt: new Date() })
        .where(eq(fiscalSettings.id, resolvedSettings.id));
    }

    await tx.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: order.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: existing ? "fiscal.document_requeued" : "fiscal.document_created",
      entityType: "fiscal_document",
      entityId: document?.id,
      metadata: { orderId, model, provider: resolvedSettings.provider },
    });

    return { ...document, queued: true };
  }

  async cancelDocument(
    context: TenantContext,
    documentId: string,
    input: { reason: string; idempotencyKey: string },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(fiscalDocuments)
        .where(
          and(eq(fiscalDocuments.tenantId, context.tenantId), eq(fiscalDocuments.id, documentId)),
        )
        .limit(1);
      if (!document) throw new NotFoundException("Fiscal document not found");
      if (document.status !== "authorized")
        throw new ConflictException("Only authorized fiscal documents can be canceled");
      if (!document.branchId) throw new BadRequestException("Fiscal document branch is required");
      await this.assertBranchOwnership(context, document.branchId);
      const [operation] = await tx
        .insert(fiscalOperations)
        .values({
          tenantId: context.tenantId,
          branchId: document.branchId,
          fiscalDocumentId: document.id,
          type: "cancel",
          environment: document.environment,
          idempotencyKey: input.idempotencyKey,
          providerReference: document.externalId ?? document.id.replaceAll("-", ""),
          status: "pending",
          metadata: { reason: input.reason },
        })
        .onConflictDoNothing({
          target: [
            fiscalOperations.tenantId,
            fiscalOperations.idempotencyKey,
            fiscalOperations.type,
          ],
        })
        .returning();
      const persisted =
        operation ??
        (
          await tx
            .select()
            .from(fiscalOperations)
            .where(
              and(
                eq(fiscalOperations.tenantId, context.tenantId),
                eq(fiscalOperations.idempotencyKey, input.idempotencyKey),
                eq(fiscalOperations.type, "cancel"),
              ),
            )
            .limit(1)
        )[0];
      if (!persisted || persisted.fiscalDocumentId !== document.id)
        throw new ConflictException("Idempotency key was used for a different cancellation");
      await tx
        .insert(outboxEvents)
        .values({
          tenantId: context.tenantId,
          topic: "fiscal.operation.pending",
          payload: {
            fiscalDocumentId: document.id,
            operationType: "cancel",
            idempotencyKey: input.idempotencyKey,
          },
          idempotencyKey: `outbox:${input.idempotencyKey}`,
        })
        .onConflictDoNothing();
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: document.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "fiscal.document_cancel_requested",
        entityType: "fiscal_operation",
        entityId: persisted.id,
        metadata: { documentId: document.id, reason: input.reason },
      });
      return {
        documentId: document.id,
        status: document.status,
        operationId: persisted.id,
        queued: true,
      };
    });
  }

  async queryDocument(context: TenantContext, documentId: string, idempotencyKey: string) {
    const document = await this.getDocument(context, documentId);
    if (!document.branchId) throw new BadRequestException("Fiscal document branch is required");
    await this.assertBranchOwnership(context, document.branchId);
    const [operation] = await this.database.db
      .insert(fiscalOperations)
      .values({
        tenantId: context.tenantId,
        branchId: document.branchId,
        fiscalDocumentId: document.id,
        type: "query",
        environment: document.environment,
        idempotencyKey,
        providerReference: document.externalId ?? document.id.replaceAll("-", ""),
        status: "pending",
      })
      .onConflictDoNothing({
        target: [fiscalOperations.tenantId, fiscalOperations.idempotencyKey, fiscalOperations.type],
      })
      .returning();
    return { documentId, operationId: operation?.id, queued: true };
  }

  async retryDocument(context: TenantContext, documentId: string) {
    const [document] = await this.database.db
      .select()
      .from(fiscalDocuments)
      .where(
        and(eq(fiscalDocuments.tenantId, context.tenantId), eq(fiscalDocuments.id, documentId)),
      )
      .limit(1);

    if (!document) {
      throw new NotFoundException("Fiscal document not found");
    }
    if (document.status === "rejected") {
      throw new ConflictException(
        "Rejected fiscal documents must be corrected and issued with a new reviewed request",
      );
    }
    if (!["pending", "error", "contingency"].includes(document.status)) {
      throw new ConflictException("Only pending, error or contingency documents can be reconciled");
    }

    const query = await this.queryDocument(
      context,
      documentId,
      `fiscal:manual-reconcile:${document.id}:${document.updatedAt.getTime()}`,
    );

    await this.audit(context, {
      ...(document.branchId ? { branchId: document.branchId } : {}),
      action: "fiscal.document_reconcile_requested",
      entityType: "fiscal_operation",
      entityId: query.operationId ?? document.id,
      metadata: {
        orderId: document.orderId,
        provider: document.provider,
        previousStatus: document.status,
      },
    });

    return { ...document, queued: true, operationId: query.operationId };
  }

  async getActiveCertificate(context: TenantContext, branchId: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.branchId, branchId),
          eq(fiscalCertificates.isActive, true),
        ),
      )
      .orderBy(desc(fiscalCertificates.createdAt))
      .limit(1);

    return certificate;
  }

  private async audit(
    context: TenantContext,
    input: {
      branchId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }

  private async assertBranchOwnership(context: TenantContext, branchId: string) {
    if (context.branchId && context.branchId !== branchId)
      throw new NotFoundException("Branch not found");
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
  }
}

function fiscalMonthRange(period: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new BadRequestException("Fiscal usage period must use YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function readFiscalUsageSettings(config: unknown) {
  const root = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const raw =
    root.usageMetering && typeof root.usageMetering === "object"
      ? (root.usageMetering as Record<string, unknown>)
      : {};
  return {
    monthlyAllowance:
      Number.isInteger(raw.monthlyAllowance) && Number(raw.monthlyAllowance) > 0
        ? Number(raw.monthlyAllowance)
        : null,
    alertAtPercent:
      Number.isInteger(raw.alertAtPercent) &&
      Number(raw.alertAtPercent) >= 1 &&
      Number(raw.alertAtPercent) <= 100
        ? Number(raw.alertAtPercent)
        : 80,
  };
}
