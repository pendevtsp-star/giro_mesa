import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  fiscalDocuments,
  fiscalSettings,
  orderItems,
  orders,
  payments,
  products,
} from "@giromesa/db";
import {
  type FiscalStatus,
  fiscalStatuses,
  stateMachines,
  type TenantContext,
} from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { buildFocusNfeNfcePayload } from "./focus-nfe.mapper";

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
      }
    );
  }

  async upsertSettings(context: TenantContext, input: FiscalSettingsInput) {
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
    return this.database.db.transaction(async (tx) => {
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
              provider: loadEnv().FISCAL_PROVIDER,
              status: "enabled",
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
          method: payments.method,
          amountCents: payments.amountCents,
          provider: payments.provider,
          status: payments.status,
        })
        .from(payments)
        .where(and(eq(payments.tenantId, context.tenantId), eq(payments.orderId, orderId)));

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
    });
  }

  async cancelDocument(context: TenantContext, documentId: string) {
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
    if (document.status !== "authorized") {
      throw new ConflictException("Only authorized fiscal documents can be canceled");
    }

    stateMachines.assertFiscalTransition(document.status, "canceled");

    const [canceled] = await this.database.db
      .update(fiscalDocuments)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(fiscalDocuments.tenantId, context.tenantId), eq(fiscalDocuments.id, documentId)),
      )
      .returning();

    await this.audit(context, {
      ...(document.branchId ? { branchId: document.branchId } : {}),
      action: "fiscal.document_canceled",
      entityType: "fiscal_document",
      entityId: document.id,
      metadata: { orderId: document.orderId, provider: document.provider },
    });

    return canceled;
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
    if (!["pending", "rejected", "error", "contingency"].includes(document.status)) {
      throw new ConflictException(
        "Only pending, rejected, error or contingency documents can retry",
      );
    }

    const [retried] = await this.database.db
      .update(fiscalDocuments)
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(fiscalDocuments.tenantId, context.tenantId), eq(fiscalDocuments.id, documentId)),
      )
      .returning();

    await this.audit(context, {
      ...(document.branchId ? { branchId: document.branchId } : {}),
      action: "fiscal.document_retried",
      entityType: "fiscal_document",
      entityId: document.id,
      metadata: {
        orderId: document.orderId,
        provider: document.provider,
        previousStatus: document.status,
      },
    });

    return retried;
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
}
