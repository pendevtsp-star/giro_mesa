import { createHash } from "node:crypto";
import {
  auditLogs,
  branches,
  cashMovements,
  cashSessions,
  commissionAccruals,
  commissionPaymentRecords,
  commissionPolicies,
  commissionPolicyMembers,
  managerialShiftSettlements,
  operationalOccurrenceEvents,
  operationalOccurrences,
  operationalShifts,
  operationIdempotency,
  orderItems,
  orders,
  payments,
  printerDevices,
  printJobs,
  staffServicePolicies,
  tableWaiterAssignments,
  userRoles,
  users,
  waiterShiftSettlements,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { OrdersService } from "../pos/orders.service";
import {
  type CommissionRule,
  calculateCommission,
  calculateShiftSettlement,
} from "./staff-finance.calculations";

type ServicePolicyInput = {
  branchId: string;
  attributionMode: "table_responsible" | "item_author" | "shift_pool";
  serviceRateBps: number;
  serviceBase: "net_consumption" | "gross_consumption" | "manual";
  requireWaiterConfirmation: boolean;
  poolRules?: Record<string, unknown> | undefined;
  confirmedLegalReview: boolean;
  expectedVersion: number;
  idempotencyKey: string;
};

type CommissionPolicyInput = {
  branchId: string;
  name: string;
  model: "fixed_rate" | "whole_band" | "progressive_bands" | "target_bonus" | "rate_plus_bonus";
  period: "shift" | "week" | "month";
  base: "net_confirmed_sales" | "net_paid_sales" | "service_received";
  attributionMode: "table_responsible" | "item_author" | "shift_pool";
  rules: {
    rateBps?: number | undefined;
    targetCents?: number | undefined;
    bonusCents?: number | undefined;
    bands?: CommissionRule[] | undefined;
  };
  memberIds: string[];
  confirmedLegalReview: boolean;
  idempotencyKey: string;
};

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function payloadHash(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

function scopedIdempotencyKey(scope: string, key: string) {
  return createHash("sha256").update(`${scope}:${key}`).digest("hex");
}

function assertIdempotentPayload(existing: string | null, expected: string) {
  if (existing && existing !== expected) {
    throw new ConflictException("A chave de idempotência foi reutilizada com outro conteúdo");
  }
}

type FinancialProjection = {
  generatedAt: string;
  settlements: Array<{
    ownerType: "waiter" | "managerial";
    ownerId: string;
    status: string;
    grossSalesCents: number;
    cancelledCents: number;
    discountCents: number;
    netConsumptionCents: number;
    serviceSuggestedCents: number;
    serviceReceivedCents: number;
    pendingCashCents: number;
    occurrenceOpenCents: number;
    occurrenceRecoveredCents: number;
    commissionAccruedCents: number;
    unassigned: boolean;
  }>;
  totals: {
    grossSalesCents: number;
    cancelledCents: number;
    discountCents: number;
    netConsumptionCents: number;
    serviceSuggestedCents: number;
    serviceReceivedCents: number;
    pendingCashCents: number;
    unassignedGrossCents: number;
    unassignedNetCents: number;
    openLossCents: number;
    recoveredCents: number;
    approvedCommissionCents: number;
    informedCommissionPaidCents: number;
  };
  totalEntries?: Array<{
    key: keyof FinancialProjection["totals"];
    label: string;
    valueCents: number;
  }>;
  projectionHash?: string;
};

const financialTotalLabels: Record<keyof FinancialProjection["totals"], string> = {
  grossSalesCents: "Vendas brutas",
  cancelledCents: "Cancelamentos",
  discountCents: "Descontos",
  netConsumptionCents: "Consumo líquido",
  serviceSuggestedCents: "Serviço sugerido",
  serviceReceivedCents: "Serviço recebido",
  pendingCashCents: "Caixa pendente",
  unassignedGrossCents: "Bruto não atribuído",
  unassignedNetCents: "Líquido não atribuído",
  openLossCents: "Ocorrências em análise",
  recoveredCents: "Valores recuperados",
  approvedCommissionCents: "Partnership aprovado",
  informedCommissionPaidCents: "Partnership informado como pago",
};

function financialTotalEntries(totals: FinancialProjection["totals"]) {
  return (Object.keys(financialTotalLabels) as Array<keyof typeof financialTotalLabels>).map(
    (key) => ({ key, label: financialTotalLabels[key], valueCents: totals[key] }),
  );
}

export function renderFinancialCsv(report: FinancialProjection) {
  const totalEntries = report.totalEntries ?? financialTotalEntries(report.totals);
  const header =
    "tipo;identificador;status;vendas_brutas_centavos;cancelamentos_centavos;descontos_centavos;vendas_liquidas_centavos;taxa_sugerida_centavos;taxa_recebida_centavos;pendencia_caixa_centavos;perdas_abertas_centavos;recuperado_centavos;parceria_apurada_centavos;nao_atribuido";
  const settlementRows = report.settlements.map((item) =>
    [
      item.ownerType,
      item.ownerId,
      item.status,
      item.grossSalesCents,
      item.cancelledCents,
      item.discountCents,
      item.netConsumptionCents,
      item.serviceSuggestedCents,
      item.serviceReceivedCents,
      item.pendingCashCents,
      item.occurrenceOpenCents,
      item.occurrenceRecoveredCents,
      item.commissionAccruedCents,
      item.unassigned ? "sim" : "nao",
    ].join(";"),
  );
  const totalRows = totalEntries.map((entry) =>
    ["TOTAL", entry.key, entry.label, entry.valueCents].join(";"),
  );
  return `\uFEFF${[
    header,
    ...settlementRows,
    "",
    "tipo;chave;descricao;valor_centavos",
    ...totalRows,
    `HASH;${report.projectionHash ?? ""}`,
  ].join("\n")}`;
}

export function renderFinancialThermal(report: FinancialProjection) {
  const money = (value: number) => `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
  const totalEntries = report.totalEntries ?? financialTotalEntries(report.totals);
  return [
    "GIROMESA - FECHAMENTO DE EQUIPE",
    "--------------------------------",
    ...report.settlements.flatMap((item) => [
      `${item.ownerType === "managerial" ? "NAO ATRIBUIDO" : item.ownerId} | ${item.status}`,
      `Liquido ${money(item.netConsumptionCents)}`,
      `Cancelado ${money(item.cancelledCents)} | Desconto ${money(item.discountCents)}`,
      `Servico sugerido ${money(item.serviceSuggestedCents)}`,
      `Servico ${money(item.serviceReceivedCents)}`,
      `Caixa pendente ${money(item.pendingCashCents)}`,
      `Perda em analise ${money(item.occurrenceOpenCents)}`,
      `Recuperado ${money(item.occurrenceRecoveredCents)}`,
      `Partnership ${money(item.commissionAccruedCents)}`,
      "--------------------------------",
    ]),
    ...totalEntries.map((entry) => `${entry.label.toUpperCase()} ${money(entry.valueCents)}`),
    `HASH ${report.projectionHash ?? ""}`,
    `GERADO ${report.generatedAt}`,
  ].join("\n");
}

export function renderFinancialPrintHtml(report: FinancialProjection) {
  const escapeHtml = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const thermal = escapeHtml(renderFinancialThermal(report));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fechamento de equipe</title><style>body{font-family:ui-monospace,monospace;max-width:80mm;margin:0 auto;padding:12mm 6mm;color:#111;background:#fff}pre{white-space:pre-wrap;font-size:12px;line-height:1.45}@media print{body{padding:0}button{display:none}}</style></head><body><button type="button" onclick="window.print()">Imprimir</button><pre>${thermal}</pre></body></html>`;
}

@Injectable()
export class StaffFinanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(forwardRef(() => OrdersService)) private readonly ordersService: OrdersService,
  ) {}

  async getServicePolicy(context: TenantContext, branchId: string) {
    await this.ensureBranch(context, branchId);
    const [policy] = await this.database.db
      .select()
      .from(staffServicePolicies)
      .where(
        and(
          eq(staffServicePolicies.tenantId, context.tenantId),
          eq(staffServicePolicies.branchId, branchId),
          eq(staffServicePolicies.isActive, true),
        ),
      )
      .limit(1);
    return policy ?? null;
  }

  async saveServicePolicy(context: TenantContext, input: ServicePolicyInput) {
    await this.ensureBranch(context, input.branchId);
    if (!input.confirmedLegalReview)
      throw new BadRequestException(
        "Confirme que a regra foi validada pelo estabelecimento antes de ativá-la",
      );
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`staff-service-policy:${context.tenantId}:${input.branchId}`}))`,
      );
      const idempotencyKey = scopedIdempotencyKey("staff-service-policy", input.idempotencyKey);
      const idempotencyPayloadHash = payloadHash({
        ...input,
        idempotencyKey: undefined,
      });
      const [replay] = await tx
        .select()
        .from(staffServicePolicies)
        .where(
          and(
            eq(staffServicePolicies.tenantId, context.tenantId),
            eq(staffServicePolicies.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, idempotencyPayloadHash);
        return replay;
      }
      const [current] = await tx
        .select()
        .from(staffServicePolicies)
        .where(
          and(
            eq(staffServicePolicies.tenantId, context.tenantId),
            eq(staffServicePolicies.branchId, input.branchId),
          ),
        )
        .orderBy(desc(staffServicePolicies.version))
        .limit(1)
        .for("update");
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException("A política de serviço foi atualizada por outra pessoa");
      await tx
        .update(staffServicePolicies)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(staffServicePolicies.tenantId, context.tenantId),
            eq(staffServicePolicies.branchId, input.branchId),
            eq(staffServicePolicies.isActive, true),
          ),
        );
      const [policy] = await tx
        .insert(staffServicePolicies)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          version: (current?.version ?? 0) + 1,
          isActive: true,
          attributionMode: input.attributionMode,
          serviceRateBps: input.serviceRateBps,
          serviceBase: input.serviceBase,
          requireWaiterConfirmation: input.requireWaiterConfirmation,
          poolRules: input.poolRules ?? {},
          confirmedLegalReview: true,
          idempotencyKey,
          idempotencyPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .returning();
      if (!policy) throw new ConflictException("Não foi possível salvar a política de serviço");
      await this.audit(
        context,
        input.branchId,
        "staff_finance.service_policy_saved",
        "staff_service_policy",
        policy.id,
        { version: policy.version },
        tx,
      );
      return policy;
    });
  }

  async applyServiceCharge(
    context: TenantContext,
    orderId: string,
    input: {
      action: "accept" | "remove" | "manual";
      manualCents?: number | undefined;
      reason?: string | undefined;
      expectedVersion: number;
    },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, orderId)))
        .limit(1)
        .for("update");
      if (!order) throw new NotFoundException("Comanda não encontrada");
      await this.ensureBranch(context, order.branchId);
      if (order.version !== input.expectedVersion)
        throw new ConflictException("A comanda foi atualizada por outra pessoa");
      if (
        ["paid", "canceled", "refunded", "written_off"].includes(order.status) ||
        order.closedAt
      ) {
        throw new BadRequestException("A taxa só pode ser ajustada antes da liquidação da comanda");
      }
      const [settledPayment] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.orderId, order.id),
            eq(payments.status, "confirmed"),
          ),
        )
        .limit(1);
      if (settledPayment)
        throw new BadRequestException("A taxa não pode ser ajustada após o primeiro pagamento");
      const amount =
        input.action === "accept"
          ? order.serviceChargeSuggestedCents
          : input.action === "manual"
            ? Math.max(0, input.manualCents ?? 0)
            : 0;
      if (input.action === "manual" && !input.reason?.trim())
        throw new BadRequestException("Informe o motivo do ajuste manual");
      const [updated] = await tx
        .update(orders)
        .set({
          serviceChargeCents: amount,
          serviceChargeStatus:
            input.action === "accept"
              ? "accepted"
              : input.action === "remove"
                ? "removed"
                : "manual",
          totalCents: Math.max(
            0,
            order.subtotalCents - order.discountCents + amount + order.deliveryFeeCents,
          ),
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.id, order.id),
            eq(orders.version, order.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("A comanda foi atualizada por outra pessoa");
      await this.audit(
        context,
        order.branchId,
        "staff_finance.service_charge_updated",
        "order",
        order.id,
        { action: input.action, amountCents: amount, reason: input.reason ?? null },
        tx,
      );
      return updated;
    });
  }

  async calculateShift(context: TenantContext, shiftId: string, idempotencyKey: string) {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`staff-finance:${context.tenantId}:${shiftId}`}))`,
      );
      const [shift] = await tx
        .select()
        .from(operationalShifts)
        .where(
          and(eq(operationalShifts.tenantId, context.tenantId), eq(operationalShifts.id, shiftId)),
        )
        .limit(1)
        .for("update");
      if (!shift) throw new NotFoundException("Turno não encontrado");
      await this.ensureBranch(context, shift.branchId);
      const calculatePayloadHash = payloadHash({ shiftId, action: "calculate" });
      const calculateScopeKey = createHash("sha256")
        .update(`${shiftId}:${idempotencyKey}`)
        .digest("hex");
      const candidates = await tx
        .select()
        .from(waiterShiftSettlements)
        .where(
          and(
            eq(waiterShiftSettlements.tenantId, context.tenantId),
            eq(waiterShiftSettlements.shiftId, shiftId),
          ),
        );
      const replayed = candidates.filter((row) =>
        row.calculateIdempotencyKey?.startsWith(`${calculateScopeKey}:`),
      );
      replayed.forEach((row) => {
        assertIdempotentPayload(row.calculatePayloadHash, calculatePayloadHash);
      });
      const [managerialReplay] = await tx
        .select()
        .from(managerialShiftSettlements)
        .where(
          and(
            eq(managerialShiftSettlements.tenantId, context.tenantId),
            eq(managerialShiftSettlements.shiftId, shiftId),
            eq(
              managerialShiftSettlements.calculateIdempotencyKey,
              `${calculateScopeKey}:unassigned`,
            ),
          ),
        )
        .limit(1);
      if (managerialReplay)
        assertIdempotentPayload(managerialReplay.calculatePayloadHash, calculatePayloadHash);
      if (replayed.length || managerialReplay) {
        return { data: replayed, managerial: managerialReplay ?? null, replayed: true };
      }
      const policy = await this.findPolicy(context, shift.branchId, tx);
      const rows = await tx
        .select({ order: orders, item: orderItems })
        .from(orders)
        .leftJoin(
          orderItems,
          and(eq(orderItems.tenantId, orders.tenantId), eq(orderItems.orderId, orders.id)),
        )
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.shiftId, shiftId)));
      const paymentRows = await tx
        .select({
          id: payments.id,
          orderId: payments.orderId,
          amountCents: payments.amountCents,
          status: payments.status,
          handover: payments.cashHandoverStatus,
          registeredByUserId: payments.registeredByUserId,
          registeredVia: payments.registeredVia,
          paymentType: payments.paymentType,
          originalPaymentId: payments.originalPaymentId,
          version: payments.version,
          updatedAt: payments.updatedAt,
        })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            inArray(payments.orderId, [...new Set(rows.map((row) => row.order.id))]),
          ),
        );
      const assignments = await tx
        .select({ waiterUserId: tableWaiterAssignments.waiterUserId })
        .from(tableWaiterAssignments)
        .where(
          and(
            eq(tableWaiterAssignments.tenantId, context.tenantId),
            eq(tableWaiterAssignments.branchId, shift.branchId),
            eq(tableWaiterAssignments.shiftId, shiftId),
          ),
        );
      const occurrenceRows = await tx
        .select()
        .from(operationalOccurrences)
        .where(
          and(
            eq(operationalOccurrences.tenantId, context.tenantId),
            eq(operationalOccurrences.shiftId, shiftId),
          ),
        );
      const occurrenceEventRows = occurrenceRows.length
        ? await tx
            .select()
            .from(operationalOccurrenceEvents)
            .where(
              and(
                eq(operationalOccurrenceEvents.tenantId, context.tenantId),
                inArray(
                  operationalOccurrenceEvents.occurrenceId,
                  occurrenceRows.map((item) => item.id),
                ),
              ),
            )
        : [];
      const occurrenceByUser = (userId: string | null) => {
        const owned = occurrenceRows.filter((item) => item.responsibleWaiterUserId === userId);
        const ids = new Set(owned.map((item) => item.id));
        return {
          openCents: owned
            .filter((item) => item.status !== "closed")
            .reduce((sum, item) => sum + item.unpaidBalanceCents, 0),
          recoveredCents: occurrenceEventRows
            .filter((event) => ids.has(event.occurrenceId))
            .reduce((sum, event) => sum + event.amountCents, 0),
          occurrenceIds: [...ids],
        };
      };
      const groupedOrders = new Map<
        string,
        { order: typeof orders.$inferSelect; items: NonNullable<typeof orderItems.$inferSelect>[] }
      >();
      for (const row of rows) {
        const current = groupedOrders.get(row.order.id) ?? { order: row.order, items: [] };
        if (row.item) current.items.push(row.item);
        groupedOrders.set(row.order.id, current);
      }
      const poolWeights = this.frozenPoolWeights(
        policy?.poolRules,
        assignments.map((entry) => entry.waiterUserId),
      );
      const calculated = calculateShiftSettlement({
        orders: [...groupedOrders.values()].map(({ order, items }) => ({
          id: order.id,
          subtotalCents: order.subtotalCents,
          discountCents: order.discountCents,
          serviceChargeSuggestedCents: order.serviceChargeSuggestedCents,
          serviceChargeCents: order.serviceChargeCents,
          items,
        })),
        payments: paymentRows.map((payment) => ({
          paymentId: payment.id,
          orderId: payment.orderId,
          amountCents: payment.amountCents,
          status: payment.status,
          paymentType: payment.paymentType,
          originalPaymentId: payment.originalPaymentId,
          handover: payment.handover,
          registeredByUserId: payment.registeredByUserId,
          registeredVia: payment.registeredVia,
        })),
        attributionMode: policy?.attributionMode ?? "table_responsible",
        poolWeights,
      });
      const calculatedAt = new Date();
      const ledgerHash = await this.currentSettlementLedgerHash(tx, context.tenantId, shiftId);
      for (const assignment of assignments) {
        if (calculated.buckets.has(assignment.waiterUserId)) continue;
        calculated.buckets.set(assignment.waiterUserId, {
          grossCents: 0,
          cancelledCents: 0,
          discountCents: 0,
          netConsumptionCents: 0,
          netPaidCents: 0,
          serviceSuggestedCents: 0,
          serviceReceivedCents: 0,
          pendingCashCents: 0,
          itemIds: [],
        });
      }
      const settlements = [];
      for (const [waiterUserId, totals] of calculated.buckets) {
        const occurrenceTotals = occurrenceByUser(waiterUserId);
        const [latest] = await tx
          .select()
          .from(waiterShiftSettlements)
          .where(
            and(
              eq(waiterShiftSettlements.tenantId, context.tenantId),
              eq(waiterShiftSettlements.shiftId, shiftId),
              eq(waiterShiftSettlements.waiterUserId, waiterUserId),
            ),
          )
          .orderBy(desc(waiterShiftSettlements.revision))
          .limit(1);
        const [created] = await tx
          .insert(waiterShiftSettlements)
          .values({
            tenantId: context.tenantId,
            branchId: shift.branchId,
            shiftId,
            waiterUserId,
            revision: (latest?.revision ?? 0) + 1,
            supersedesId: latest?.id,
            status: policy?.requireWaiterConfirmation ? "awaiting_confirmation" : "checked",
            policyId: policy?.id ?? null,
            policySnapshot: policy ? policySnapshot(policy) : {},
            grossSalesCents: totals.grossCents,
            cancelledCents: totals.cancelledCents,
            discountCents: totals.discountCents,
            netConsumptionCents: totals.netConsumptionCents,
            serviceSuggestedCents: totals.serviceSuggestedCents,
            serviceReceivedCents: totals.serviceReceivedCents,
            pooledServiceCents:
              policy?.attributionMode === "shift_pool" ? totals.serviceReceivedCents : 0,
            pendingCashCents: totals.pendingCashCents,
            occurrenceOpenCents: occurrenceTotals.openCents,
            occurrenceRecoveredCents: occurrenceTotals.recoveredCents,
            breakdown: {
              ...calculated.breakdown,
              participant: totals,
              itemIds: totals.itemIds,
              occurrenceIds: occurrenceTotals.occurrenceIds,
              calculatedAt: calculatedAt.toISOString(),
              ledgerHash,
            },
            calculateIdempotencyKey: `${calculateScopeKey}:${waiterUserId}`,
            calculatePayloadHash,
            calculatedAt,
            ledgerHash,
          })
          .returning();
        if (!created)
          throw new ConflictException("Não foi possível calcular o fechamento do garçom");
        settlements.push(created);
      }
      const managerialHasValue = Object.entries(calculated.unassigned)
        .filter(([key]) => key !== "itemIds")
        .some(([, value]) => typeof value === "number" && value !== 0);
      let managerial: typeof managerialShiftSettlements.$inferSelect | null = null;
      if (managerialHasValue) {
        const occurrenceTotals = occurrenceByUser(null);
        const [latestManagerial] = await tx
          .select()
          .from(managerialShiftSettlements)
          .where(
            and(
              eq(managerialShiftSettlements.tenantId, context.tenantId),
              eq(managerialShiftSettlements.shiftId, shiftId),
            ),
          )
          .orderBy(desc(managerialShiftSettlements.revision))
          .limit(1);
        const managerialRows = await tx
          .insert(managerialShiftSettlements)
          .values({
            tenantId: context.tenantId,
            branchId: shift.branchId,
            shiftId,
            revision: (latestManagerial?.revision ?? 0) + 1,
            supersedesId: latestManagerial?.id ?? null,
            status: "checked",
            policyId: policy?.id ?? null,
            policySnapshot: policy ? policySnapshot(policy) : {},
            grossSalesCents: calculated.unassigned.grossCents,
            cancelledCents: calculated.unassigned.cancelledCents,
            discountCents: calculated.unassigned.discountCents,
            netConsumptionCents: calculated.unassigned.netConsumptionCents,
            netPaidCents: calculated.unassigned.netPaidCents,
            serviceSuggestedCents: calculated.unassigned.serviceSuggestedCents,
            serviceReceivedCents: calculated.unassigned.serviceReceivedCents,
            pendingCashCents: calculated.unassigned.pendingCashCents,
            breakdown: {
              ...calculated.breakdown,
              participant: calculated.unassigned,
              bucket: "unassigned",
              occurrenceOpenCents: occurrenceTotals.openCents,
              occurrenceRecoveredCents: occurrenceTotals.recoveredCents,
              occurrenceIds: occurrenceTotals.occurrenceIds,
              calculatedAt: calculatedAt.toISOString(),
              ledgerHash,
            },
            calculateIdempotencyKey: `${calculateScopeKey}:unassigned`,
            calculatePayloadHash,
            calculatedAt,
            ledgerHash,
            checkedByUserId: context.userId ?? null,
            checkedAt: new Date(),
          })
          .returning();
        managerial = managerialRows[0] ?? null;
      }
      await this.audit(
        context,
        shift.branchId,
        "staff_finance.settlement_calculated",
        "operational_shift",
        shiftId,
        { count: settlements.length },
        tx,
      );
      return { data: settlements, managerial, replayed: false };
    });
  }

  async getSettlementDetail(context: TenantContext, settlementId: string) {
    const [settlement] = await this.database.db
      .select()
      .from(waiterShiftSettlements)
      .where(
        and(
          eq(waiterShiftSettlements.tenantId, context.tenantId),
          eq(waiterShiftSettlements.id, settlementId),
        ),
      )
      .limit(1);
    if (!settlement) throw new NotFoundException("Fechamento não encontrado");
    await this.ensureBranch(context, settlement.branchId);
    const events = await this.database.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, context.tenantId),
          eq(auditLogs.entityType, "waiter_shift_settlement"),
          eq(auditLogs.entityId, settlementId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt));
    return { settlement, events };
  }

  async getFinancialReport(context: TenantContext, branchId: string, shiftId?: string) {
    await this.ensureBranch(context, branchId);
    const shifts = await this.database.db
      .select({
        id: operationalShifts.id,
        openedAt: operationalShifts.openedAt,
        closedAt: operationalShifts.closedAt,
        status: operationalShifts.status,
      })
      .from(operationalShifts)
      .where(
        and(
          eq(operationalShifts.tenantId, context.tenantId),
          eq(operationalShifts.branchId, branchId),
          shiftId ? eq(operationalShifts.id, shiftId) : undefined,
        ),
      )
      .orderBy(desc(operationalShifts.openedAt));
    if (shiftId && shifts.length === 0) throw new NotFoundException("Turno não encontrado");
    const shiftIds = shifts.map((shift) => shift.id);
    const settlementRows = shiftIds.length
      ? await this.database.db
          .select()
          .from(waiterShiftSettlements)
          .where(
            and(
              eq(waiterShiftSettlements.tenantId, context.tenantId),
              inArray(waiterShiftSettlements.shiftId, shiftIds),
            ),
          )
          .orderBy(desc(waiterShiftSettlements.revision))
      : [];
    const latest = settlementRows.filter(
      (row, index, rows) =>
        !rows
          .slice(0, index)
          .some(
            (other) => other.shiftId === row.shiftId && other.waiterUserId === row.waiterUserId,
          ),
    );
    const managerialRows = shiftIds.length
      ? await this.database.db
          .select()
          .from(managerialShiftSettlements)
          .where(
            and(
              eq(managerialShiftSettlements.tenantId, context.tenantId),
              inArray(managerialShiftSettlements.shiftId, shiftIds),
            ),
          )
          .orderBy(desc(managerialShiftSettlements.revision))
      : [];
    const latestManagerial = managerialRows.filter(
      (row, index, rows) => !rows.slice(0, index).some((other) => other.shiftId === row.shiftId),
    );
    const occurrences = shiftIds.length
      ? await this.database.db
          .select()
          .from(operationalOccurrences)
          .where(
            and(
              eq(operationalOccurrences.tenantId, context.tenantId),
              eq(operationalOccurrences.branchId, branchId),
              inArray(operationalOccurrences.shiftId, shiftIds),
            ),
          )
          .orderBy(desc(operationalOccurrences.createdAt))
      : [];
    const occurrenceIds = occurrences.map((item) => item.id);
    const occurrenceEvents = occurrenceIds.length
      ? await this.database.db
          .select()
          .from(operationalOccurrenceEvents)
          .where(
            and(
              eq(operationalOccurrenceEvents.tenantId, context.tenantId),
              inArray(operationalOccurrenceEvents.occurrenceId, occurrenceIds),
            ),
          )
      : [];
    const accrualRows = await this.database.db
      .select()
      .from(commissionAccruals)
      .where(
        and(
          eq(commissionAccruals.tenantId, context.tenantId),
          eq(commissionAccruals.branchId, branchId),
        ),
      )
      .orderBy(desc(commissionAccruals.revision));
    const accruals = accrualRows.filter(
      (row, index, rows) =>
        !rows
          .slice(0, index)
          .some(
            (other) =>
              other.policyId === row.policyId &&
              other.userId === row.userId &&
              other.periodStart.getTime() === row.periodStart.getTime() &&
              other.periodEnd.getTime() === row.periodEnd.getTime(),
          ),
    );
    const occurrenceTotalsFor = (userId: string | null) => {
      const owned = occurrences.filter((item) => item.responsibleWaiterUserId === userId);
      const ids = new Set(owned.map((item) => item.id));
      return {
        openCents: owned
          .filter((item) => item.status !== "closed")
          .reduce((sum, item) => sum + item.unpaidBalanceCents, 0),
        recoveredCents: occurrenceEvents
          .filter((event) => ids.has(event.occurrenceId))
          .reduce((sum, event) => sum + event.amountCents, 0),
      };
    };
    const commissionFor = (userId: string) =>
      accruals
        .filter((item) => item.userId === userId)
        .reduce((sum, item) => sum + item.approvedCents, 0);
    const settlements = [
      ...latest.map((item) => {
        const occurrence = occurrenceTotalsFor(item.waiterUserId);
        return {
          id: item.id,
          shiftId: item.shiftId,
          ownerType: "waiter" as const,
          ownerId: item.waiterUserId,
          status: item.status,
          grossSalesCents: item.grossSalesCents,
          cancelledCents: item.cancelledCents,
          discountCents: item.discountCents,
          netConsumptionCents: item.netConsumptionCents,
          serviceSuggestedCents: item.serviceSuggestedCents,
          serviceReceivedCents: item.serviceReceivedCents,
          pendingCashCents: item.pendingCashCents,
          occurrenceOpenCents: occurrence.openCents,
          occurrenceRecoveredCents: occurrence.recoveredCents,
          commissionAccruedCents: commissionFor(item.waiterUserId),
          unassigned: false,
          revision: item.revision,
          calculatedAt: item.calculatedAt,
          ledgerHash: item.ledgerHash,
          breakdown: item.breakdown,
        };
      }),
      ...latestManagerial.map((item) => {
        const occurrence = occurrenceTotalsFor(null);
        return {
          id: item.id,
          shiftId: item.shiftId,
          ownerType: "managerial" as const,
          ownerId: "unassigned",
          status: item.status,
          grossSalesCents: item.grossSalesCents,
          cancelledCents: item.cancelledCents,
          discountCents: item.discountCents,
          netConsumptionCents: item.netConsumptionCents,
          serviceSuggestedCents: item.serviceSuggestedCents,
          serviceReceivedCents: item.serviceReceivedCents,
          pendingCashCents: item.pendingCashCents,
          occurrenceOpenCents: occurrence.openCents,
          occurrenceRecoveredCents: occurrence.recoveredCents,
          commissionAccruedCents: 0,
          unassigned: true,
          revision: item.revision,
          calculatedAt: item.calculatedAt,
          ledgerHash: item.ledgerHash,
          breakdown: item.breakdown,
        };
      }),
    ];
    const recoveredCents = occurrenceEvents.reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
    const totals = {
      grossSalesCents: settlements.reduce((sum, item) => sum + item.grossSalesCents, 0),
      cancelledCents: settlements.reduce((sum, item) => sum + item.cancelledCents, 0),
      discountCents: settlements.reduce((sum, item) => sum + item.discountCents, 0),
      netConsumptionCents: settlements.reduce((sum, item) => sum + item.netConsumptionCents, 0),
      serviceSuggestedCents: settlements.reduce((sum, item) => sum + item.serviceSuggestedCents, 0),
      serviceReceivedCents: settlements.reduce((sum, item) => sum + item.serviceReceivedCents, 0),
      pendingCashCents: settlements.reduce((sum, item) => sum + item.pendingCashCents, 0),
      unassignedGrossCents: settlements
        .filter((item) => item.unassigned)
        .reduce((sum, item) => sum + item.grossSalesCents, 0),
      unassignedNetCents: settlements
        .filter((item) => item.unassigned)
        .reduce((sum, item) => sum + item.netConsumptionCents, 0),
      openLossCents: occurrences
        .filter((item) => item.status !== "closed")
        .reduce((sum, item) => sum + item.unpaidBalanceCents, 0),
      recoveredCents,
      approvedCommissionCents: accruals.reduce((sum, item) => sum + item.approvedCents, 0),
      informedCommissionPaidCents: accruals.reduce((sum, item) => sum + item.paidCents, 0),
    };
    const projection = {
      generatedAt: new Date().toISOString(),
      branchId,
      shifts,
      settlements,
      occurrences,
      occurrenceEvents,
      accruals,
      totals,
      totalEntries: financialTotalEntries(totals),
    };
    return {
      ...projection,
      projectionHash: payloadHash({ ...projection, generatedAt: undefined }),
    };
  }

  async financialReportCsv(context: TenantContext, branchId: string, shiftId?: string) {
    const report = await this.getFinancialReport(context, branchId, shiftId);
    return renderFinancialCsv(report);
  }

  async financialReportThermal(context: TenantContext, branchId: string, shiftId?: string) {
    const report = await this.getFinancialReport(context, branchId, shiftId);
    return renderFinancialThermal(report);
  }

  async financialReportPrintHtml(context: TenantContext, branchId: string, shiftId?: string) {
    const report = await this.getFinancialReport(context, branchId, shiftId);
    return renderFinancialPrintHtml(report);
  }

  async queueFinancialReport(
    context: TenantContext,
    input: {
      branchId: string;
      shiftId?: string | undefined;
      printerDeviceId: string;
      copies: number;
      idempotencyKey: string;
    },
  ) {
    await this.ensureBranch(context, input.branchId);
    const report = await this.getFinancialReport(context, input.branchId, input.shiftId);
    const normalizedKey = scopedIdempotencyKey("staff-financial-print", input.idempotencyKey);
    return this.database.db.transaction(async (tx) => {
      const [device] = await tx
        .select({ id: printerDevices.id })
        .from(printerDevices)
        .where(
          and(
            eq(printerDevices.tenantId, context.tenantId),
            eq(printerDevices.branchId, input.branchId),
            eq(printerDevices.id, input.printerDeviceId),
            eq(printerDevices.isActive, true),
          ),
        )
        .limit(1);
      if (!device) throw new NotFoundException("Impressora ativa não encontrada nesta filial");
      const [replay] = await tx
        .select()
        .from(printJobs)
        .where(
          and(
            eq(printJobs.tenantId, context.tenantId),
            eq(printJobs.idempotencyKey, normalizedKey),
          ),
        )
        .limit(1);
      if (replay) return { ...replay, replayed: true };
      const [job] = await tx
        .insert(printJobs)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          printerDeviceId: device.id,
          requestedByUserId: context.userId ?? null,
          kind: "staff_financial_report",
          idempotencyKey: normalizedKey,
          copies: input.copies,
          payload: {
            shiftId: input.shiftId ?? null,
            projectionHash: report.projectionHash ?? null,
          },
          renderedText: renderFinancialThermal(report),
        })
        .onConflictDoNothing()
        .returning();
      if (!job) throw new ConflictException("O relatório já foi enviado para impressão");
      await this.audit(
        context,
        input.branchId,
        "staff_finance.report_queued",
        "print_job",
        job.id,
        { shiftId: input.shiftId ?? null, projectionHash: report.projectionHash ?? null },
        tx,
      );
      return { ...job, replayed: false };
    });
  }

  async listSettlements(context: TenantContext, shiftId: string, selfOnly = false) {
    const [shift] = await this.database.db
      .select({ branchId: operationalShifts.branchId })
      .from(operationalShifts)
      .where(
        and(eq(operationalShifts.tenantId, context.tenantId), eq(operationalShifts.id, shiftId)),
      )
      .limit(1);
    if (!shift) throw new NotFoundException("Turno não encontrado");
    await this.ensureBranch(context, shift.branchId);
    const rows = await this.database.db
      .select()
      .from(waiterShiftSettlements)
      .where(
        and(
          eq(waiterShiftSettlements.tenantId, context.tenantId),
          eq(waiterShiftSettlements.shiftId, shiftId),
          selfOnly ? eq(waiterShiftSettlements.waiterUserId, context.userId ?? "") : undefined,
        ),
      )
      .orderBy(desc(waiterShiftSettlements.revision));
    return rows.filter(
      (row, index, all) =>
        !all.some(
          (other, otherIndex) => otherIndex < index && other.waiterUserId === row.waiterUserId,
        ),
    );
  }

  async getManagerialSettlement(context: TenantContext, shiftId: string) {
    const [shift] = await this.database.db
      .select({ branchId: operationalShifts.branchId })
      .from(operationalShifts)
      .where(
        and(eq(operationalShifts.tenantId, context.tenantId), eq(operationalShifts.id, shiftId)),
      )
      .limit(1);
    if (!shift) throw new NotFoundException("Turno não encontrado");
    await this.ensureBranch(context, shift.branchId);
    const [managerial] = await this.database.db
      .select()
      .from(managerialShiftSettlements)
      .where(
        and(
          eq(managerialShiftSettlements.tenantId, context.tenantId),
          eq(managerialShiftSettlements.shiftId, shiftId),
        ),
      )
      .orderBy(desc(managerialShiftSettlements.revision))
      .limit(1);
    return managerial ?? null;
  }

  async transitionManagerialSettlement(
    context: TenantContext,
    settlementId: string,
    action: "close" | "reopen",
    input: { expectedVersion: number; reason?: string | undefined; idempotencyKey: string },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [settlement] = await tx
        .select()
        .from(managerialShiftSettlements)
        .where(
          and(
            eq(managerialShiftSettlements.tenantId, context.tenantId),
            eq(managerialShiftSettlements.id, settlementId),
          ),
        )
        .limit(1)
        .for("update");
      if (!settlement) throw new NotFoundException("Bucket gerencial não encontrado");
      await this.ensureBranch(context, settlement.branchId);
      const requestHash = payloadHash({
        settlementId,
        action,
        expectedVersion: input.expectedVersion,
        reason: input.reason?.trim() ?? null,
      });
      const replay = await this.reserveOperation(
        tx,
        context,
        settlement.branchId,
        `managerial-settlement:${settlementId}:${action}`,
        input.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      if (settlement.version !== input.expectedVersion)
        throw new ConflictException("O bucket gerencial foi atualizado por outra pessoa");
      if (action === "close") {
        if (settlement.status !== "checked")
          throw new BadRequestException("Somente um bucket conferido pode ser fechado");
        if (settlement.pendingCashCents > 0)
          throw new BadRequestException("Existe dinheiro pendente no bucket gerencial");
        await this.assertSettlementFresh(
          tx,
          context.tenantId,
          settlement.shiftId,
          settlement.ledgerHash,
        );
        const [updated] = await tx
          .update(managerialShiftSettlements)
          .set({
            status: "closed",
            version: settlement.version + 1,
            closedByUserId: context.userId ?? null,
            closedAt: new Date(),
            closeIdempotencyKey: input.idempotencyKey,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(managerialShiftSettlements.id, settlement.id),
              eq(managerialShiftSettlements.version, settlement.version),
            ),
          )
          .returning();
        if (!updated)
          throw new ConflictException("O bucket gerencial foi atualizado por outra pessoa");
        await this.completeOperation(
          tx,
          context,
          settlement.branchId,
          `managerial-settlement:${settlementId}:${action}`,
          input.idempotencyKey,
          updated,
        );
        return updated;
      }
      if (settlement.status !== "closed")
        throw new BadRequestException("Somente um bucket fechado pode ser reaberto");
      if (!input.reason?.trim()) throw new BadRequestException("Informe o motivo da reabertura");
      const [copy] = await tx
        .insert(managerialShiftSettlements)
        .values({
          ...settlement,
          id: undefined,
          revision: settlement.revision + 1,
          supersedesId: settlement.id,
          status: "reopened",
          version: 1,
          calculateIdempotencyKey: null,
          closeIdempotencyKey: null,
          reopenReason: input.reason.trim(),
          closedAt: null,
          closedByUserId: null,
          createdAt: undefined,
          updatedAt: undefined,
        })
        .returning();
      if (!copy) throw new ConflictException("Não foi possível reabrir o fechamento gerencial");
      await this.completeOperation(
        tx,
        context,
        settlement.branchId,
        `managerial-settlement:${settlementId}:${action}`,
        input.idempotencyKey,
        copy,
      );
      return copy;
    });
  }

  async transitionSettlement(
    context: TenantContext,
    settlementId: string,
    action: "confirm" | "check" | "close" | "reopen",
    input: {
      expectedVersion: number;
      reason?: string | undefined;
      idempotencyKey: string;
    },
    selfOnly = false,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [settlement] = await tx
        .select()
        .from(waiterShiftSettlements)
        .where(
          and(
            eq(waiterShiftSettlements.tenantId, context.tenantId),
            eq(waiterShiftSettlements.id, settlementId),
          ),
        )
        .limit(1)
        .for("update");
      if (!settlement) throw new NotFoundException("Fechamento não encontrado");
      await this.ensureBranch(context, settlement.branchId);
      if (selfOnly && settlement.waiterUserId !== context.userId)
        throw new NotFoundException("Fechamento não encontrado");
      const actionScope = `waiter-settlement:${settlementId}:${action}`;
      const actionHash = payloadHash({
        settlementId,
        action,
        expectedVersion: input.expectedVersion,
        reason: input.reason?.trim() ?? null,
      });
      const replay = await this.reserveOperation(
        tx,
        context,
        settlement.branchId,
        actionScope,
        input.idempotencyKey,
        actionHash,
      );
      if (replay) return replay;
      if (settlement.version !== input.expectedVersion)
        throw new ConflictException("O fechamento foi atualizado por outra pessoa");
      const permittedTransitions: Record<typeof action, readonly string[]> = {
        confirm: ["awaiting_confirmation"],
        check: ["awaiting_confirmation"],
        close: ["checked"],
        reopen: ["closed"],
      };
      if (!permittedTransitions[action].includes(settlement.status))
        throw new BadRequestException(
          "Esta ação não está disponível para o estado atual do fechamento",
        );
      if (action === "check" && settlement.policySnapshot.requireWaiterConfirmation === true)
        throw new BadRequestException("Este fechamento precisa ser confirmado pelo próprio garçom");
      if (action !== "reopen")
        await this.assertSettlementFresh(
          tx,
          context.tenantId,
          settlement.shiftId,
          settlement.ledgerHash,
        );
      if (action === "close" && settlement.pendingCashCents > 0)
        throw new BadRequestException("Ainda existe dinheiro a entregar ao caixa");
      if (action === "reopen" && !input.reason?.trim())
        throw new BadRequestException("Informe o motivo da reabertura");
      if (action === "reopen") {
        const reason = input.reason?.trim();
        if (!reason) throw new BadRequestException("Informe o motivo da reabertura");
        const [copy] = await tx
          .insert(waiterShiftSettlements)
          .values({
            ...settlement,
            id: undefined,
            revision: settlement.revision + 1,
            supersedesId: settlement.id,
            status: "reopened",
            version: 1,
            calculateIdempotencyKey: null,
            closeIdempotencyKey: null,
            reopenReason: reason,
            checkedAt: null,
            checkedByUserId: null,
            closedAt: null,
            closedByUserId: null,
            waiterConfirmedAt: null,
            createdAt: undefined,
            updatedAt: undefined,
          })
          .returning();
        if (!copy) throw new ConflictException("Não foi possível reabrir o fechamento do garçom");
        await this.audit(
          context,
          settlement.branchId,
          "staff_finance.settlement_reopened",
          "waiter_shift_settlement",
          copy.id,
          { previousId: settlement.id },
          tx,
        );
        await this.completeOperation(
          tx,
          context,
          settlement.branchId,
          actionScope,
          input.idempotencyKey,
          copy,
        );
        return copy;
      }
      const status = action === "confirm" ? "checked" : action === "check" ? "checked" : "closed";
      const [updated] = await tx
        .update(waiterShiftSettlements)
        .set({
          status,
          version: settlement.version + 1,
          waiterConfirmedAt: action === "confirm" ? new Date() : settlement.waiterConfirmedAt,
          checkedAt: action === "check" ? new Date() : settlement.checkedAt,
          checkedByUserId: action === "check" ? context.userId : settlement.checkedByUserId,
          closedAt: action === "close" ? new Date() : settlement.closedAt,
          closedByUserId: action === "close" ? context.userId : settlement.closedByUserId,
          closeIdempotencyKey:
            action === "close" ? input.idempotencyKey : settlement.closeIdempotencyKey,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(waiterShiftSettlements.id, settlement.id),
            eq(waiterShiftSettlements.version, settlement.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("O fechamento foi atualizado por outra pessoa");
      await this.audit(
        context,
        settlement.branchId,
        `staff_finance.settlement_${action}ed`,
        "waiter_shift_settlement",
        settlement.id,
        {},
        tx,
      );
      await this.completeOperation(
        tx,
        context,
        settlement.branchId,
        actionScope,
        input.idempotencyKey,
        updated,
      );
      return updated;
    });
  }

  async assertCanCloseShift(context: TenantContext, shiftId: string, client = this.database.db) {
    const [shift] = await client
      .select({ branchId: operationalShifts.branchId })
      .from(operationalShifts)
      .where(
        and(eq(operationalShifts.tenantId, context.tenantId), eq(operationalShifts.id, shiftId)),
      )
      .limit(1);
    if (!shift) throw new NotFoundException("Turno não encontrado");
    await this.ensureBranch(context, shift.branchId);
    const participantRows = await client
      .select({ userId: tableWaiterAssignments.waiterUserId })
      .from(tableWaiterAssignments)
      .where(
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.shiftId, shiftId),
        ),
      );
    const itemRows = await client
      .select({
        responsible: orderItems.responsibleWaiterUserId,
        author: orderItems.registeredByUserId,
      })
      .from(orderItems)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, orderItems.tenantId), eq(orders.id, orderItems.orderId)),
      )
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.shiftId, shiftId)));
    const shiftOrders = await client
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.shiftId, shiftId)));
    const cashCollectors = shiftOrders.length
      ? await client
          .select({ userId: payments.registeredByUserId })
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, context.tenantId),
              inArray(
                payments.orderId,
                shiftOrders.map((order) => order.id),
              ),
              eq(payments.registeredVia, "waiter"),
              inArray(payments.cashHandoverStatus, ["pending", "disputed"]),
            ),
          )
      : [];
    const snapshots = await client
      .select()
      .from(waiterShiftSettlements)
      .where(
        and(
          eq(waiterShiftSettlements.tenantId, context.tenantId),
          eq(waiterShiftSettlements.shiftId, shiftId),
        ),
      )
      .orderBy(desc(waiterShiftSettlements.revision));
    const latestByUser = new Map<string, typeof waiterShiftSettlements.$inferSelect>();
    for (const row of snapshots)
      if (!latestByUser.has(row.waiterUserId)) latestByUser.set(row.waiterUserId, row);
    const [latestManagerial] = await client
      .select()
      .from(managerialShiftSettlements)
      .where(
        and(
          eq(managerialShiftSettlements.tenantId, context.tenantId),
          eq(managerialShiftSettlements.shiftId, shiftId),
        ),
      )
      .orderBy(desc(managerialShiftSettlements.revision))
      .limit(1);
    const snapshotForMode = snapshots[0]?.policySnapshot ?? latestManagerial?.policySnapshot;
    const activePolicy = snapshotForMode
      ? null
      : await this.findPolicy(context, shift.branchId, client);
    const attributionMode =
      (typeof snapshotForMode?.attributionMode === "string"
        ? snapshotForMode.attributionMode
        : activePolicy?.attributionMode) ?? "table_responsible";
    const participants = new Set<string>();
    let managerialRequired = false;
    if (attributionMode === "shift_pool") {
      const frozenWeights = snapshots
        .flatMap((snapshot) => {
          const weights = snapshot.breakdown?.poolWeights;
          return Array.isArray(weights) ? weights : [];
        })
        .flatMap((weight) =>
          weight &&
          typeof weight === "object" &&
          typeof (weight as Record<string, unknown>).userId === "string"
            ? [String((weight as Record<string, unknown>).userId)]
            : [],
        );
      for (const userId of frozenWeights.length
        ? frozenWeights
        : participantRows.map((row) => row.userId))
        participants.add(userId);
      managerialRequired =
        itemRows.some((item) => !item.responsible && !item.author) ||
        (shiftOrders.length > 0 && participants.size === 0);
    } else {
      for (const item of itemRows) {
        const userId = attributionMode === "item_author" ? item.author : item.responsible;
        if (userId) participants.add(userId);
        else managerialRequired = true;
      }
    }
    for (const collector of cashCollectors) {
      if (collector.userId) participants.add(collector.userId);
      else managerialRequired = true;
    }
    if (shiftOrders.length > 0 && snapshots.length === 0 && !latestManagerial)
      throw new BadRequestException("Calcule o fechamento da equipe antes de encerrar o turno");
    const blocking = [...participants].some((userId) => {
      const snapshot = latestByUser.get(userId);
      return snapshot?.status !== "closed" || snapshot.pendingCashCents > 0;
    });
    const managerialBlocking =
      managerialRequired &&
      (latestManagerial?.status !== "closed" || latestManagerial.pendingCashCents > 0);
    if (blocking || managerialBlocking)
      throw new BadRequestException(
        "Conclua os fechamentos da equipe e as entregas de dinheiro antes de encerrar o turno",
      );
    const ledgerHashes = [
      ...[...participants].map((userId) => latestByUser.get(userId)?.ledgerHash),
      managerialRequired ? latestManagerial?.ledgerHash : undefined,
    ].filter((value): value is string => typeof value === "string" && value.length === 64);
    if (ledgerHashes.length === 0 || new Set(ledgerHashes).size !== 1)
      throw new ConflictException(
        "O fechamento está incompleto ou mistura cálculos diferentes. Recalcule.",
      );
    await this.assertSettlementFresh(client, context.tenantId, shiftId, ledgerHashes[0] ?? "");
    const disputedHandover = await client
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, payments.tenantId), eq(orders.id, payments.orderId)),
      )
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(orders.shiftId, shiftId),
          eq(payments.status, "confirmed"),
          eq(payments.cashHandoverStatus, "disputed"),
        ),
      )
      .limit(1);
    if (disputedHandover.length)
      throw new BadRequestException("Existe entrega de dinheiro em divergência para este turno");
  }

  async listOccurrences(
    context: TenantContext,
    branchId: string,
    shiftId?: string,
    status?: string,
  ) {
    await this.ensureBranch(context, branchId);
    return this.database.db
      .select()
      .from(operationalOccurrences)
      .where(
        and(
          eq(operationalOccurrences.tenantId, context.tenantId),
          eq(operationalOccurrences.branchId, branchId),
          shiftId ? eq(operationalOccurrences.shiftId, shiftId) : undefined,
          status ? eq(operationalOccurrences.status, status) : undefined,
        ),
      )
      .orderBy(desc(operationalOccurrences.createdAt));
  }

  async listOpenOrders(context: TenantContext, branchId: string) {
    await this.ensureBranch(context, branchId);
    return this.database.db
      .select({
        id: orders.id,
        tableId: orders.tableId,
        channel: orders.channel,
        status: orders.status,
        subtotalCents: orders.subtotalCents,
        discountCents: orders.discountCents,
        serviceChargeSuggestedCents: orders.serviceChargeSuggestedCents,
        serviceChargeCents: orders.serviceChargeCents,
        serviceChargeStatus: orders.serviceChargeStatus,
        totalCents: orders.totalCents,
        version: orders.version,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          inArray(orders.status, [
            "draft",
            "opened",
            "sent_to_kitchen",
            "preparing",
            "ready",
            "served",
            "waiting_payment",
            "partially_paid",
          ]),
        ),
      )
      .orderBy(desc(orders.createdAt));
  }

  async listOccurrenceEvents(context: TenantContext, occurrenceId: string) {
    const [occurrence] = await this.database.db
      .select({ branchId: operationalOccurrences.branchId })
      .from(operationalOccurrences)
      .where(
        and(
          eq(operationalOccurrences.tenantId, context.tenantId),
          eq(operationalOccurrences.id, occurrenceId),
        ),
      )
      .limit(1);
    if (!occurrence) throw new NotFoundException("Ocorrência não encontrada");
    await this.ensureBranch(context, occurrence.branchId);
    return this.database.db
      .select()
      .from(operationalOccurrenceEvents)
      .where(
        and(
          eq(operationalOccurrenceEvents.tenantId, context.tenantId),
          eq(operationalOccurrenceEvents.occurrenceId, occurrenceId),
        ),
      )
      .orderBy(desc(operationalOccurrenceEvents.createdAt));
  }

  async createOccurrence(
    context: TenantContext,
    input: {
      branchId: string;
      orderId?: string | undefined;
      type: string;
      report: string;
      idempotencyKey: string;
    },
  ) {
    await this.ensureBranch(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      const occurrencePayloadHash = payloadHash({
        branchId: input.branchId,
        orderId: input.orderId ?? null,
        type: input.type,
        report: input.report.trim(),
      });
      const occurrenceIdempotencyKey = scopedIdempotencyKey(
        "occurrence-create",
        input.idempotencyKey,
      );
      const [replay] = await tx
        .select()
        .from(operationalOccurrences)
        .where(
          and(
            eq(operationalOccurrences.tenantId, context.tenantId),
            eq(operationalOccurrences.idempotencyKey, occurrenceIdempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, occurrencePayloadHash);
        return { ...replay, replayed: true };
      }
      const [order] = input.orderId
        ? await tx
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.tenantId, context.tenantId),
                eq(orders.id, input.orderId),
                eq(orders.branchId, input.branchId),
              ),
            )
            .limit(1)
        : [];
      if (input.orderId && !order)
        throw new NotFoundException("A comanda informada não pertence a esta filial");
      if (
        order &&
        (order.closedAt || ["paid", "canceled", "refunded", "written_off"].includes(order.status))
      )
        throw new BadRequestException("A ocorrência deve referenciar uma comanda aberta");
      const paidSnapshotCents = await this.confirmedPaid(tx, context.tenantId, order?.id);
      const [assignment] =
        order?.tableId && order.shiftId
          ? await tx
              .select({ waiterUserId: tableWaiterAssignments.waiterUserId })
              .from(tableWaiterAssignments)
              .where(
                and(
                  eq(tableWaiterAssignments.tenantId, context.tenantId),
                  eq(tableWaiterAssignments.tableId, order.tableId),
                  eq(tableWaiterAssignments.shiftId, order.shiftId),
                  sql`${tableWaiterAssignments.endedAt} is null`,
                ),
              )
              .limit(1)
          : [];
      const branchPolicy = await this.findPolicy(context, input.branchId, tx);
      const [created] = await tx
        .insert(operationalOccurrences)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          shiftId: order?.shiftId ?? null,
          tableId: order?.tableId ?? null,
          orderId: order?.id ?? null,
          responsibleWaiterUserId: assignment?.waiterUserId ?? null,
          type: input.type,
          initialReport: input.report.trim(),
          unpaidBalanceCents: Math.max(0, (order?.totalCents ?? 0) - paidSnapshotCents),
          menuValueCents: order?.subtotalCents ?? 0,
          serviceSuggestedCents: order?.serviceChargeSuggestedCents ?? 0,
          paidSnapshotCents,
          branchRuleSnapshot: branchPolicy ? policySnapshot(branchPolicy) : {},
          idempotencyKey: occurrenceIdempotencyKey,
          idempotencyPayloadHash: occurrencePayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        const [concurrent] = await tx
          .select()
          .from(operationalOccurrences)
          .where(
            and(
              eq(operationalOccurrences.tenantId, context.tenantId),
              or(
                eq(operationalOccurrences.idempotencyKey, occurrenceIdempotencyKey),
                input.orderId
                  ? and(
                      eq(operationalOccurrences.orderId, input.orderId),
                      eq(operationalOccurrences.type, input.type),
                      inArray(operationalOccurrences.status, ["under_review", "approved"]),
                    )
                  : undefined,
              ),
            ),
          )
          .limit(1);
        if (concurrent) {
          assertIdempotentPayload(concurrent.idempotencyPayloadHash, occurrencePayloadHash);
          return { ...concurrent, replayed: true };
        }
        throw new ConflictException("Não foi possível registrar a ocorrência");
      }
      await tx.insert(operationalOccurrenceEvents).values({
        tenantId: context.tenantId,
        occurrenceId: created.id,
        eventType: "reported",
        resultingStatus: "under_review",
        note: input.report.trim(),
        idempotencyKey: scopedIdempotencyKey("occurrence-reported", input.idempotencyKey),
        idempotencyPayloadHash: occurrencePayloadHash,
        createdByUserId: context.userId ?? null,
      });
      await this.audit(
        context,
        input.branchId,
        "staff_finance.occurrence_created",
        "operational_occurrence",
        created.id,
        { orderId: order?.id ?? null },
        tx,
      );
      return { ...created, replayed: false };
    });
  }

  async transitionOccurrence(
    context: TenantContext,
    occurrenceId: string,
    input: {
      expectedVersion: number;
      decision: "house_loss" | "dismissed" | "approved";
      note?: string | undefined;
      idempotencyKey: string;
    },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [occurrence] = await tx
        .select()
        .from(operationalOccurrences)
        .where(
          and(
            eq(operationalOccurrences.tenantId, context.tenantId),
            eq(operationalOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
        .for("update");
      if (!occurrence) throw new NotFoundException("Ocorrência não encontrada");
      await this.ensureBranch(context, occurrence.branchId);
      const decisionPayloadHash = payloadHash({
        occurrenceId,
        decision: input.decision,
        note: input.note?.trim() ?? null,
      });
      const decisionIdempotencyKey = scopedIdempotencyKey(
        "occurrence-decision",
        input.idempotencyKey,
      );
      const [previousEvent] = await tx
        .select()
        .from(operationalOccurrenceEvents)
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.idempotencyKey, decisionIdempotencyKey),
          ),
        )
        .limit(1);
      if (previousEvent) {
        assertIdempotentPayload(previousEvent.idempotencyPayloadHash, decisionPayloadHash);
        return previousEvent;
      }
      if (occurrence.version !== input.expectedVersion)
        throw new ConflictException("A ocorrência foi atualizada por outra pessoa");
      if (occurrence.status !== "under_review")
        throw new BadRequestException("A ocorrência já recebeu uma decisão");
      if (input.decision === "house_loss") {
        if (!occurrence.orderId || occurrence.unpaidBalanceCents <= 0)
          throw new BadRequestException("A baixa exige uma comanda em aberto com saldo pendente");
        const [order] = await tx
          .select({ id: orders.id, version: orders.version })
          .from(orders)
          .where(
            and(
              eq(orders.tenantId, context.tenantId),
              eq(orders.id, occurrence.orderId),
              eq(orders.branchId, occurrence.branchId),
            ),
          )
          .limit(1)
          .for("update");
        if (!order) throw new NotFoundException("Comanda não encontrada");
        await this.ordersService.writeOffOrderInTransaction(
          context,
          order.id,
          {
            expectedVersion: order.version,
            reason: input.note?.trim() ?? occurrence.initialReport,
          },
          tx,
        );
      }
      const status = input.decision === "approved" ? "approved" : "closed";
      const [updated] = await tx
        .update(operationalOccurrences)
        .set({
          status,
          decision: input.decision,
          decidedByUserId: context.userId ?? null,
          decidedAt: new Date(),
          version: occurrence.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(operationalOccurrences.id, occurrence.id),
            eq(operationalOccurrences.version, occurrence.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("A ocorrência foi atualizada por outra pessoa");
      await tx.insert(operationalOccurrenceEvents).values({
        tenantId: context.tenantId,
        occurrenceId,
        eventType: "manager_decision",
        resultingStatus: status,
        resultingDecision: input.decision,
        note: input.note?.trim() ?? null,
        idempotencyKey: decisionIdempotencyKey,
        idempotencyPayloadHash: decisionPayloadHash,
        createdByUserId: context.userId ?? null,
      });
      await this.audit(
        context,
        occurrence.branchId,
        "staff_finance.occurrence_decided",
        "operational_occurrence",
        occurrenceId,
        { decision: input.decision },
        tx,
      );
      return updated;
    });
  }

  async recoverOccurrence(
    context: TenantContext,
    occurrenceId: string,
    input: {
      amountCents: number;
      method: string;
      reference?: string | undefined;
      note?: string | undefined;
      idempotencyKey: string;
    },
  ) {
    if (input.amountCents <= 0)
      throw new BadRequestException("O valor recuperado deve ser positivo");
    return this.database.db.transaction(async (tx) => {
      const [occurrence] = await tx
        .select()
        .from(operationalOccurrences)
        .where(
          and(
            eq(operationalOccurrences.tenantId, context.tenantId),
            eq(operationalOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
        .for("update");
      if (!occurrence) throw new NotFoundException("Ocorrência não encontrada");
      await this.ensureBranch(context, occurrence.branchId);
      if (
        !["approved", "closed"].includes(occurrence.status) ||
        !["approved", "house_loss"].includes(occurrence.decision ?? "")
      )
        throw new BadRequestException("A recuperação exige uma decisão gerencial compatível");
      const recoveryPayloadHash = payloadHash({
        occurrenceId,
        amountCents: input.amountCents,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
      });
      const recoveryIdempotencyKey = scopedIdempotencyKey(
        "occurrence-recovery",
        input.idempotencyKey,
      );
      const [replay] = await tx
        .select()
        .from(operationalOccurrenceEvents)
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.idempotencyKey, recoveryIdempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, recoveryPayloadHash);
        return replay;
      }
      const recoveredRows = await tx
        .select({ amountCents: operationalOccurrenceEvents.amountCents })
        .from(operationalOccurrenceEvents)
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.occurrenceId, occurrenceId),
            inArray(operationalOccurrenceEvents.eventType, ["recovery", "recovery_reversal"]),
          ),
        );
      const recoveredCents = recoveredRows.reduce((sum, row) => sum + row.amountCents, 0);
      if (recoveredCents + input.amountCents > occurrence.unpaidBalanceCents)
        throw new BadRequestException("A recuperação excede o saldo pendente da ocorrência");
      const [cash] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, context.tenantId),
            eq(cashSessions.branchId, occurrence.branchId),
            eq(cashSessions.status, "open"),
          ),
        )
        .limit(1)
        .for("update");
      const [movement] = cash
        ? await tx
            .insert(cashMovements)
            .values({
              tenantId: context.tenantId,
              branchId: occurrence.branchId,
              cashSessionId: cash.id,
              type: "supply",
              amountCents: input.amountCents,
              reason: "Recuperação de ocorrência",
              sourceType: "operational_occurrence",
              sourceId: occurrence.id,
              idempotencyKey: scopedIdempotencyKey("occurrence-cash", input.idempotencyKey),
              createdByUserId: context.userId ?? "",
            })
            .onConflictDoNothing()
            .returning()
        : [];
      if (cash && movement) {
        const [updatedCash] = await tx
          .update(cashSessions)
          .set({
            expectedAmountCents: cash.expectedAmountCents + input.amountCents,
            version: cash.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(cashSessions.id, cash.id), eq(cashSessions.version, cash.version)))
          .returning({ id: cashSessions.id });
        if (!updatedCash) throw new ConflictException("O caixa foi atualizado por outra pessoa");
      }
      if (cash && !movement)
        throw new ConflictException("A recuperação já foi registrada no caixa");
      const [event] = await tx
        .insert(operationalOccurrenceEvents)
        .values({
          tenantId: context.tenantId,
          occurrenceId,
          eventType: "recovery",
          resultingStatus: occurrence.status,
          amountCents: input.amountCents,
          method: input.method,
          reference: input.reference ?? null,
          note: input.note ?? null,
          cashMovementId: movement?.id ?? null,
          idempotencyKey: recoveryIdempotencyKey,
          idempotencyPayloadHash: recoveryPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!event) {
        const [concurrent] = await tx
          .select()
          .from(operationalOccurrenceEvents)
          .where(
            and(
              eq(operationalOccurrenceEvents.tenantId, context.tenantId),
              eq(operationalOccurrenceEvents.idempotencyKey, recoveryIdempotencyKey),
            ),
          )
          .limit(1);
        if (concurrent) {
          assertIdempotentPayload(concurrent.idempotencyPayloadHash, recoveryPayloadHash);
          return concurrent;
        }
        throw new ConflictException("Não foi possível registrar a recuperação");
      }
      await this.audit(
        context,
        occurrence.branchId,
        "staff_finance.occurrence_recovered",
        "operational_occurrence",
        occurrenceId,
        { amountCents: input.amountCents, movementId: movement?.id ?? null },
        tx,
      );
      return event;
    });
  }

  async reverseRecovery(
    context: TenantContext,
    recordId: string,
    input: { note: string; idempotencyKey: string },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(operationalOccurrenceEvents)
        .innerJoin(
          operationalOccurrences,
          and(
            eq(operationalOccurrences.tenantId, operationalOccurrenceEvents.tenantId),
            eq(operationalOccurrences.id, operationalOccurrenceEvents.occurrenceId),
          ),
        )
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.id, recordId),
            eq(operationalOccurrenceEvents.eventType, "recovery"),
          ),
        )
        .limit(1)
        .for("update");
      if (!event) throw new NotFoundException("Recuperação não encontrada");
      await this.ensureBranch(context, event.operational_occurrences.branchId);
      const reversalPayloadHash = payloadHash({ recordId, note: input.note.trim() });
      const reversalIdempotencyKey = scopedIdempotencyKey(
        "occurrence-recovery-reversal",
        input.idempotencyKey,
      );
      const [replay] = await tx
        .select()
        .from(operationalOccurrenceEvents)
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.idempotencyKey, reversalIdempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, reversalPayloadHash);
        return replay;
      }
      const [alreadyReversed] = await tx
        .select({ id: operationalOccurrenceEvents.id })
        .from(operationalOccurrenceEvents)
        .where(
          and(
            eq(operationalOccurrenceEvents.tenantId, context.tenantId),
            eq(operationalOccurrenceEvents.reversesEventId, recordId),
          ),
        )
        .limit(1);
      if (alreadyReversed) throw new ConflictException("A recuperação já foi revertida");
      const [originalMovement] = event.operational_occurrence_events.cashMovementId
        ? await tx
            .select()
            .from(cashMovements)
            .where(
              and(
                eq(cashMovements.tenantId, context.tenantId),
                eq(cashMovements.id, event.operational_occurrence_events.cashMovementId),
              ),
            )
            .limit(1)
        : [];
      const [cash] = originalMovement
        ? await tx
            .select()
            .from(cashSessions)
            .where(
              and(
                eq(cashSessions.tenantId, context.tenantId),
                eq(cashSessions.branchId, event.operational_occurrences.branchId),
                eq(cashSessions.status, "open"),
              ),
            )
            .orderBy(desc(cashSessions.openedAt))
            .limit(1)
            .for("update")
        : [];
      if (originalMovement && !cash)
        throw new ConflictException("Abra um caixa para registrar o estorno da recuperação");
      const [reversal] = await tx
        .insert(operationalOccurrenceEvents)
        .values({
          tenantId: context.tenantId,
          occurrenceId: event.operational_occurrences.id,
          eventType: "recovery_reversal",
          resultingStatus: event.operational_occurrences.status,
          amountCents: -event.operational_occurrence_events.amountCents,
          note: input.note.trim(),
          reversesEventId: recordId,
          idempotencyKey: reversalIdempotencyKey,
          idempotencyPayloadHash: reversalPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!reversal)
        throw new ConflictException("A recuperação já foi revertida por outra operação");
      if (originalMovement && cash) {
        const [reverseMovement] = await tx
          .insert(cashMovements)
          .values({
            tenantId: context.tenantId,
            branchId: event.operational_occurrences.branchId,
            cashSessionId: cash.id,
            type: "withdrawal",
            amountCents: originalMovement.amountCents,
            reason: "Estorno de recuperação de ocorrência",
            sourceType: "operational_occurrence_reversal",
            sourceId: recordId,
            idempotencyKey: scopedIdempotencyKey("occurrence-reversal-cash", input.idempotencyKey),
            createdByUserId: context.userId ?? "",
          })
          .onConflictDoNothing()
          .returning();
        if (!reverseMovement)
          throw new ConflictException("Não foi possível registrar o estorno no caixa");
        const [updatedCash] = await tx
          .update(cashSessions)
          .set({
            expectedAmountCents: cash.expectedAmountCents - originalMovement.amountCents,
            version: cash.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(cashSessions.id, cash.id), eq(cashSessions.version, cash.version)))
          .returning({ id: cashSessions.id });
        if (!updatedCash) throw new ConflictException("O caixa foi atualizado por outra pessoa");
      }
      await this.audit(
        context,
        event.operational_occurrences.branchId,
        "staff_finance.occurrence_recovery_reversed",
        "operational_occurrence",
        event.operational_occurrences.id,
        { recoveryEventId: recordId },
        tx,
      );
      return reversal;
    });
  }

  async listCommissionPolicies(context: TenantContext, branchId: string) {
    await this.ensureBranch(context, branchId);
    return this.database.db
      .select()
      .from(commissionPolicies)
      .where(
        and(
          eq(commissionPolicies.tenantId, context.tenantId),
          eq(commissionPolicies.branchId, branchId),
        ),
      )
      .orderBy(desc(commissionPolicies.createdAt));
  }
  simulateCommission(input: {
    baseCents: number;
    model: CommissionPolicyInput["model"];
    rules: CommissionPolicyInput["rules"];
  }) {
    return { baseCents: input.baseCents, calculatedCents: calculateCommission(input) };
  }

  async createCommissionPolicy(context: TenantContext, input: CommissionPolicyInput) {
    await this.ensureBranch(context, input.branchId);
    this.assertCommissionRules(input.model, input.rules);
    if (new Set(input.memberIds).size !== input.memberIds.length)
      throw new BadRequestException("Não repita participantes na mesma regra");
    if (!input.confirmedLegalReview)
      throw new BadRequestException(
        "Confirme que a regra foi validada pelo estabelecimento antes de ativá-la",
      );
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`commission-policy-create:${context.tenantId}:${input.branchId}:${input.name}`}))`,
      );
      const idempotencyKey = scopedIdempotencyKey("commission-policy-create", input.idempotencyKey);
      const idempotencyPayloadHash = payloadHash({
        ...input,
        memberIds: [...input.memberIds].sort(),
        idempotencyKey: undefined,
      });
      const [replay] = await tx
        .select()
        .from(commissionPolicies)
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, idempotencyPayloadHash);
        return replay;
      }
      await this.assertEligibleMembers(tx, context, input.branchId, input.memberIds);
      const [last] = await tx
        .select({ version: commissionPolicies.version })
        .from(commissionPolicies)
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.branchId, input.branchId),
            eq(commissionPolicies.name, input.name),
          ),
        )
        .orderBy(desc(commissionPolicies.version))
        .limit(1);
      const [policy] = await tx
        .insert(commissionPolicies)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          name: input.name,
          version: (last?.version ?? 0) + 1,
          status: "draft",
          model: input.model,
          period: input.period,
          base: input.base,
          attributionMode: input.attributionMode,
          rules: input.rules,
          confirmedLegalReview: true,
          effectiveFrom: null,
          idempotencyKey,
          idempotencyPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .returning();
      if (!policy) throw new ConflictException("Não foi possível criar a política de parceria");
      if (input.memberIds.length)
        await tx.insert(commissionPolicyMembers).values(
          input.memberIds.map((userId) => ({
            tenantId: context.tenantId,
            policyId: policy.id,
            userId,
            eligible: true,
          })),
        );
      await this.audit(
        context,
        input.branchId,
        "staff_finance.commission_policy_created",
        "commission_policy",
        policy.id,
        { version: policy.version },
        tx,
      );
      return policy;
    });
  }

  async activateCommissionPolicy(
    context: TenantContext,
    policyId: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.database.db.transaction(async (tx) => {
      const activationIdempotencyKey = scopedIdempotencyKey(
        "commission-policy-activate",
        input.idempotencyKey,
      );
      const activationPayloadHash = payloadHash({
        policyId,
        expectedVersion: input.expectedVersion,
      });
      const [replay] = await tx
        .select()
        .from(commissionPolicies)
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.activationIdempotencyKey, activationIdempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        await this.ensureBranch(context, replay.branchId);
        assertIdempotentPayload(replay.activationPayloadHash, activationPayloadHash);
        return replay;
      }
      const [policy] = await tx
        .select()
        .from(commissionPolicies)
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.id, policyId),
          ),
        )
        .limit(1)
        .for("update");
      if (!policy) throw new NotFoundException("Regra de parceria não encontrada");
      await this.ensureBranch(context, policy.branchId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`commission-policy:${context.tenantId}:${policy.branchId}:${policy.name}`}))`,
      );
      if (policy.version !== input.expectedVersion)
        throw new ConflictException("A política de parceria foi atualizada por outra pessoa");
      if (policy.status !== "draft")
        throw new BadRequestException("Somente uma regra em rascunho pode ser ativada");
      if (!policy.confirmedLegalReview)
        throw new BadRequestException(
          "A regra exige confirmação de validação pelo estabelecimento",
        );
      await tx
        .update(commissionPolicies)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.branchId, policy.branchId),
            eq(commissionPolicies.name, policy.name),
            eq(commissionPolicies.status, "active"),
          ),
        );
      const [updated] = await tx
        .update(commissionPolicies)
        .set({
          status: "active",
          effectiveFrom: new Date(),
          activationIdempotencyKey,
          activationPayloadHash,
          version: policy.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(commissionPolicies.id, policyId), eq(commissionPolicies.version, policy.version)),
        )
        .returning();
      if (!updated) throw new ConflictException("Não foi possível ativar a política de parceria");
      await this.audit(
        context,
        policy.branchId,
        "staff_finance.commission_policy_activated",
        "commission_policy",
        policyId,
        {},
        tx,
      );
      return updated;
    });
  }

  async calculateCommissionAccrual(
    context: TenantContext,
    input: {
      policyId: string;
      userId: string;
      periodStart: Date;
      periodEnd: Date;
      idempotencyKey: string;
    },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [policy] = await tx
        .select()
        .from(commissionPolicies)
        .where(
          and(
            eq(commissionPolicies.tenantId, context.tenantId),
            eq(commissionPolicies.id, input.policyId),
          ),
        )
        .limit(1)
        .for("update");
      if (!policy) throw new NotFoundException("Regra de parceria não encontrada");
      await this.ensureBranch(context, policy.branchId);
      if (policy.status !== "active" || !policy.effectiveFrom)
        throw new BadRequestException("A regra de parceria precisa estar ativa para nova apuração");
      if (input.periodStart >= input.periodEnd)
        throw new BadRequestException("O início do período deve ser anterior ao fim");
      this.assertCommissionPeriod(policy.period, input.periodStart, input.periodEnd);
      if (input.periodStart < policy.effectiveFrom)
        throw new BadRequestException("O período não pode começar antes da ativação da regra");
      const accrualPayloadHash = payloadHash({
        policyId: input.policyId,
        userId: input.userId,
        periodStart: input.periodStart.toISOString(),
        periodEnd: input.periodEnd.toISOString(),
      });
      const [replay] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, accrualPayloadHash);
        return { ...replay, replayed: true };
      }
      const member = await this.assertEligiblePolicyMember(
        tx,
        context,
        policy.id,
        policy.branchId,
        input.userId,
      );
      const effectiveStart = input.periodStart;
      if (policy.period === "shift") {
        const [periodShift] = await tx
          .select({ id: operationalShifts.id })
          .from(operationalShifts)
          .where(
            and(
              eq(operationalShifts.tenantId, context.tenantId),
              eq(operationalShifts.branchId, policy.branchId),
              eq(operationalShifts.status, "closed"),
              eq(operationalShifts.openedAt, input.periodStart),
              eq(operationalShifts.closedAt, input.periodEnd),
            ),
          )
          .limit(1);
        if (!periodShift)
          throw new BadRequestException(
            "Para parceria por turno, use exatamente a abertura e o fechamento do turno",
          );
      }
      const settlementRows = await tx
        .select({
          settlement: waiterShiftSettlements,
          openedAt: operationalShifts.openedAt,
          closedAt: operationalShifts.closedAt,
        })
        .from(waiterShiftSettlements)
        .innerJoin(
          operationalShifts,
          and(
            eq(operationalShifts.tenantId, waiterShiftSettlements.tenantId),
            eq(operationalShifts.id, waiterShiftSettlements.shiftId),
          ),
        )
        .where(
          and(
            eq(waiterShiftSettlements.tenantId, context.tenantId),
            eq(waiterShiftSettlements.branchId, policy.branchId),
            eq(waiterShiftSettlements.waiterUserId, input.userId),
            eq(operationalShifts.status, "closed"),
            gte(operationalShifts.closedAt, effectiveStart),
            lte(operationalShifts.closedAt, input.periodEnd),
          ),
        );
      const latestSettlements = new Map<string, typeof waiterShiftSettlements.$inferSelect>();
      for (const row of settlementRows.sort(
        (left, right) => right.settlement.revision - left.settlement.revision,
      )) {
        if (!latestSettlements.has(row.settlement.shiftId))
          latestSettlements.set(row.settlement.shiftId, row.settlement);
      }
      for (const settlement of latestSettlements.values()) {
        if (settlement.status !== "closed")
          throw new BadRequestException(
            "Existe fechamento vigente reaberto ou ainda não concluído no período",
          );
        if (settlement.policySnapshot.attributionMode !== policy.attributionMode)
          throw new BadRequestException(
            "A atribuição da parceria difere do fechamento congelado; recalcule o turno com a regra compatível",
          );
      }
      const baseCents = [...latestSettlements.values()].reduce((sum, settlement) => {
        if (policy.base === "service_received") return sum + settlement.serviceReceivedCents;
        if (policy.base === "net_paid_sales") {
          const participant = settlement.breakdown?.participant;
          const netPaidCents =
            participant &&
            typeof participant === "object" &&
            typeof (participant as Record<string, unknown>).netPaidCents === "number"
              ? Number((participant as Record<string, unknown>).netPaidCents)
              : 0;
          return sum + netPaidCents;
        }
        return sum + settlement.netConsumptionCents;
      }, 0);
      const memberOverride =
        member.override && typeof member.override === "object"
          ? ((member.override.rules && typeof member.override.rules === "object"
              ? member.override.rules
              : member.override) as CommissionPolicyInput["rules"])
          : {};
      const effectiveRules = {
        ...(policy.rules as CommissionPolicyInput["rules"]),
        ...memberOverride,
      };
      this.assertCommissionRules(policy.model as CommissionPolicyInput["model"], effectiveRules);
      const calculatedCents = calculateCommission({
        baseCents,
        model: policy.model as CommissionPolicyInput["model"],
        rules: effectiveRules,
      });
      const [latest] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.userId, input.userId),
            eq(commissionAccruals.policyId, policy.id),
            eq(commissionAccruals.periodStart, input.periodStart),
            eq(commissionAccruals.periodEnd, input.periodEnd),
          ),
        )
        .orderBy(desc(commissionAccruals.revision))
        .limit(1);
      if (latest && !["rejected", "reversed"].includes(latest.status))
        throw new BadRequestException("Já existe uma apuração vigente para este período");
      const [accrual] = await tx
        .insert(commissionAccruals)
        .values({
          tenantId: context.tenantId,
          branchId: policy.branchId,
          userId: input.userId,
          policyId: policy.id,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          revision: (latest?.revision ?? 0) + 1,
          supersedesId: latest?.id ?? null,
          policySnapshot: { ...policySnapshot(policy), memberOverride, effectiveRules },
          baseCents,
          calculatedCents,
          status: "calculated",
          idempotencyKey: input.idempotencyKey,
          idempotencyPayloadHash: accrualPayloadHash,
        })
        .returning();
      if (!accrual) throw new ConflictException("Não foi possível calcular a parceria");
      await this.audit(
        context,
        policy.branchId,
        "staff_finance.commission_accrued",
        "commission_accrual",
        accrual.id,
        { userId: input.userId, calculatedCents },
        tx,
      );
      return { ...accrual, replayed: false };
    });
  }

  async listAccruals(context: TenantContext, branchId: string, userId?: string) {
    await this.ensureBranch(context, branchId);
    return this.database.db
      .select()
      .from(commissionAccruals)
      .where(
        and(
          eq(commissionAccruals.tenantId, context.tenantId),
          eq(commissionAccruals.branchId, branchId),
          userId ? eq(commissionAccruals.userId, userId) : undefined,
        ),
      )
      .orderBy(desc(commissionAccruals.createdAt));
  }

  async listCommissionPayments(context: TenantContext, branchId: string) {
    await this.ensureBranch(context, branchId);
    return this.database.db
      .select({
        id: commissionPaymentRecords.id,
        accrualId: commissionPaymentRecords.accrualId,
        amountCents: commissionPaymentRecords.amountCents,
        informedAt: commissionPaymentRecords.informedAt,
        method: commissionPaymentRecords.method,
        reversesRecordId: commissionPaymentRecords.reversesRecordId,
      })
      .from(commissionPaymentRecords)
      .innerJoin(
        commissionAccruals,
        and(
          eq(commissionAccruals.tenantId, commissionPaymentRecords.tenantId),
          eq(commissionAccruals.id, commissionPaymentRecords.accrualId),
        ),
      )
      .where(
        and(
          eq(commissionPaymentRecords.tenantId, context.tenantId),
          eq(commissionAccruals.branchId, branchId),
        ),
      )
      .orderBy(desc(commissionPaymentRecords.createdAt));
  }

  async approveAccrual(
    context: TenantContext,
    accrualId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.updateAccrual(context, accrualId, expectedVersion, {
      status: "approved",
      idempotencyKey,
    });
  }

  async rejectAccrual(
    context: TenantContext,
    accrualId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ) {
    return this.updateAccrual(context, accrualId, expectedVersion, {
      status: "rejected",
      reason,
      idempotencyKey,
    });
  }

  async recordCommissionPayment(
    context: TenantContext,
    accrualId: string,
    input: {
      amountCents: number;
      informedAt: Date;
      method: string;
      reference?: string | undefined;
      note?: string | undefined;
      idempotencyKey: string;
    },
  ) {
    if (input.amountCents <= 0)
      throw new BadRequestException("O valor informado deve ser positivo");
    return this.database.db.transaction(async (tx) => {
      const [accrual] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.id, accrualId),
          ),
        )
        .limit(1)
        .for("update");
      if (!accrual) throw new NotFoundException("Apuração não encontrada");
      await this.ensureBranch(context, accrual.branchId);
      const paymentPayloadHash = payloadHash({
        accrualId,
        amountCents: input.amountCents,
        informedAt: input.informedAt.toISOString(),
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
      });
      const [existingPayment] = await tx
        .select()
        .from(commissionPaymentRecords)
        .where(
          and(
            eq(commissionPaymentRecords.tenantId, context.tenantId),
            eq(commissionPaymentRecords.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existingPayment) {
        assertIdempotentPayload(existingPayment.idempotencyPayloadHash, paymentPayloadHash);
        return existingPayment;
      }
      if (!["approved", "partially_paid"].includes(accrual.status))
        throw new BadRequestException(
          "A apuração precisa estar aprovada antes do registro informativo",
        );
      const paid = await this.sumRecordPayments(tx, context.tenantId, accrualId);
      if (paid + input.amountCents > accrual.approvedCents)
        throw new BadRequestException("O registro excede o valor aprovado");
      const [record] = await tx
        .insert(commissionPaymentRecords)
        .values({
          tenantId: context.tenantId,
          accrualId,
          amountCents: input.amountCents,
          informedAt: input.informedAt,
          method: input.method,
          reference: input.reference ?? null,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
          idempotencyPayloadHash: paymentPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!record) {
        const [replay] = await tx
          .select()
          .from(commissionPaymentRecords)
          .where(
            and(
              eq(commissionPaymentRecords.tenantId, context.tenantId),
              eq(commissionPaymentRecords.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (replay) {
          assertIdempotentPayload(replay.idempotencyPayloadHash, paymentPayloadHash);
          return replay;
        }
        throw new ConflictException("A chave de registro já foi usada");
      }
      const nextPaid = paid + input.amountCents;
      await tx
        .update(commissionAccruals)
        .set({
          paidCents: nextPaid,
          status: nextPaid === accrual.approvedCents ? "paid" : "partially_paid",
          version: accrual.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commissionAccruals.id, accrual.id),
            eq(commissionAccruals.version, accrual.version),
          ),
        );
      await this.audit(
        context,
        accrual.branchId,
        "staff_finance.commission_payment_recorded",
        "commission_accrual",
        accrualId,
        { amountCents: input.amountCents },
        tx,
      );
      return record;
    });
  }

  async reverseCommissionPayment(
    context: TenantContext,
    recordId: string,
    input: { note: string; idempotencyKey: string },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(commissionPaymentRecords)
        .where(
          and(
            eq(commissionPaymentRecords.tenantId, context.tenantId),
            eq(commissionPaymentRecords.id, recordId),
          ),
        )
        .limit(1)
        .for("update");
      if (!record) throw new NotFoundException("Registro não encontrado");
      if (record.amountCents <= 0 || record.reversesRecordId)
        throw new BadRequestException(
          "Somente um registro de pagamento original pode ser revertido",
        );
      const [accrualBeforeReverse] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.id, record.accrualId),
          ),
        )
        .limit(1)
        .for("update");
      if (!accrualBeforeReverse) throw new NotFoundException("Apuração não encontrada");
      await this.ensureBranch(context, accrualBeforeReverse.branchId);
      const reversalPayloadHash = payloadHash({ recordId, note: input.note.trim() });
      const [replay] = await tx
        .select()
        .from(commissionPaymentRecords)
        .where(
          and(
            eq(commissionPaymentRecords.tenantId, context.tenantId),
            eq(commissionPaymentRecords.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        assertIdempotentPayload(replay.idempotencyPayloadHash, reversalPayloadHash);
        return replay;
      }
      const [alreadyReversed] = await tx
        .select({ id: commissionPaymentRecords.id })
        .from(commissionPaymentRecords)
        .where(
          and(
            eq(commissionPaymentRecords.tenantId, context.tenantId),
            eq(commissionPaymentRecords.reversesRecordId, recordId),
          ),
        )
        .limit(1);
      if (alreadyReversed) throw new ConflictException("O registro já foi revertido");
      const [reversal] = await tx
        .insert(commissionPaymentRecords)
        .values({
          tenantId: context.tenantId,
          accrualId: record.accrualId,
          amountCents: -record.amountCents,
          informedAt: new Date(),
          method: record.method,
          note: input.note.trim(),
          reversesRecordId: record.id,
          idempotencyKey: input.idempotencyKey,
          idempotencyPayloadHash: reversalPayloadHash,
          createdByUserId: context.userId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!reversal) throw new ConflictException("O registro já foi revertido");
      const [accrual] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.id, record.accrualId),
          ),
        )
        .limit(1)
        .for("update");
      if (accrual) {
        const paidCents = await this.sumRecordPayments(tx, context.tenantId, record.accrualId);
        await tx
          .update(commissionAccruals)
          .set({
            paidCents,
            status: paidCents === 0 ? "reversed" : "partially_paid",
            version: accrual.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(commissionAccruals.id, accrual.id),
              eq(commissionAccruals.version, accrual.version),
            ),
          );
      }
      await this.audit(
        context,
        accrualBeforeReverse.branchId,
        "staff_finance.commission_payment_reversed",
        "commission_payment_record",
        recordId,
        { reversalId: reversal.id },
        tx,
      );
      return reversal;
    });
  }

  private async updateAccrual(
    context: TenantContext,
    accrualId: string,
    expectedVersion: number,
    update: {
      status: "approved" | "rejected";
      approvedCents?: number | undefined;
      reason?: string | undefined;
      idempotencyKey: string;
    },
  ) {
    return this.database.db.transaction(async (tx) => {
      const [accrual] = await tx
        .select()
        .from(commissionAccruals)
        .where(
          and(
            eq(commissionAccruals.tenantId, context.tenantId),
            eq(commissionAccruals.id, accrualId),
          ),
        )
        .limit(1)
        .for("update");
      if (!accrual) throw new NotFoundException("Apuração não encontrada");
      await this.ensureBranch(context, accrual.branchId);
      const scope = `commission-accrual:${accrualId}:${update.status}`;
      const requestHash = payloadHash({
        accrualId,
        status: update.status,
        expectedVersion,
        approvedCents: update.approvedCents ?? null,
        reason: update.reason?.trim() ?? null,
      });
      const replay = await this.reserveOperation(
        tx,
        context,
        accrual.branchId,
        scope,
        update.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      if (accrual.status !== "calculated" || accrual.version !== expectedVersion)
        throw new ConflictException("A apuração foi atualizada por outra pessoa");
      const approvedCents =
        update.status === "approved" ? (update.approvedCents ?? accrual.calculatedCents) : 0;
      if (approvedCents < 0 || approvedCents > accrual.calculatedCents)
        throw new BadRequestException("O valor aprovado deve estar entre zero e o valor calculado");
      const [updated] = await tx
        .update(commissionAccruals)
        .set({
          status: update.status,
          approvedCents,
          approvedByUserId: update.status === "approved" ? (context.userId ?? null) : null,
          approvedAt: update.status === "approved" ? new Date() : null,
          reason: update.reason?.trim() ?? null,
          version: accrual.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commissionAccruals.id, accrual.id),
            eq(commissionAccruals.version, accrual.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("A apuração foi atualizada por outra pessoa");
      await this.audit(
        context,
        updated.branchId,
        update.status === "approved"
          ? "staff_finance.commission_approved"
          : "staff_finance.commission_rejected",
        "commission_accrual",
        updated.id,
        { approvedCents: updated.approvedCents },
        tx,
      );
      await this.completeOperation(
        tx,
        context,
        accrual.branchId,
        scope,
        update.idempotencyKey,
        updated,
      );
      return updated;
    });
  }

  private async ensureBranch(context: TenantContext, branchId: string) {
    if (context.branchId && context.branchId !== branchId) {
      throw new ForbiddenException("Acesso à filial não autorizado");
    }
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.tenantId, context.tenantId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Filial não encontrada");
  }
  private async assertSettlementFresh(
    client: typeof this.database.db,
    tenantId: string,
    shiftId: string,
    expectedLedgerHash: string,
  ) {
    const currentLedgerHash = await this.currentSettlementLedgerHash(client, tenantId, shiftId);
    if (currentLedgerHash !== expectedLedgerHash)
      throw new ConflictException(
        "Um movimento financeiro mudou após o cálculo. Recalcule o fechamento.",
      );
  }
  private async currentSettlementLedgerHash(
    client: typeof this.database.db,
    tenantId: string,
    shiftId: string,
  ) {
    const orderLedger = await client
      .select({
        orderId: orders.id,
        orderVersion: orders.version,
        orderStatus: orders.status,
        subtotalCents: orders.subtotalCents,
        discountCents: orders.discountCents,
        serviceChargeSuggestedCents: orders.serviceChargeSuggestedCents,
        serviceChargeCents: orders.serviceChargeCents,
        orderUpdatedAt: orders.updatedAt,
        itemId: orderItems.id,
        itemStatus: orderItems.status,
        itemTotalCents: orderItems.totalCents,
        itemResponsibleWaiterUserId: orderItems.responsibleWaiterUserId,
        itemRegisteredByUserId: orderItems.registeredByUserId,
        itemUpdatedAt: orderItems.updatedAt,
      })
      .from(orders)
      .leftJoin(
        orderItems,
        and(eq(orderItems.tenantId, orders.tenantId), eq(orderItems.orderId, orders.id)),
      )
      .where(and(eq(orders.tenantId, tenantId), eq(orders.shiftId, shiftId)));
    const paymentLedger = await client
      .select({
        paymentId: payments.id,
        orderId: payments.orderId,
        amountCents: payments.amountCents,
        status: payments.status,
        handover: payments.cashHandoverStatus,
        registeredByUserId: payments.registeredByUserId,
        registeredVia: payments.registeredVia,
        paymentType: payments.paymentType,
        originalPaymentId: payments.originalPaymentId,
        version: payments.version,
        updatedAt: payments.updatedAt,
      })
      .from(payments)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, payments.tenantId), eq(orders.id, payments.orderId)),
      )
      .where(and(eq(payments.tenantId, tenantId), eq(orders.shiftId, shiftId)));
    const occurrenceLedger = await client
      .select({
        occurrenceId: operationalOccurrences.id,
        branchId: operationalOccurrences.branchId,
        responsibleWaiterUserId: operationalOccurrences.responsibleWaiterUserId,
        status: operationalOccurrences.status,
        type: operationalOccurrences.type,
        menuValueCents: operationalOccurrences.menuValueCents,
        serviceSuggestedCents: operationalOccurrences.serviceSuggestedCents,
        paidSnapshotCents: operationalOccurrences.paidSnapshotCents,
        unpaidBalanceCents: operationalOccurrences.unpaidBalanceCents,
        version: operationalOccurrences.version,
        updatedAt: operationalOccurrences.updatedAt,
      })
      .from(operationalOccurrences)
      .where(
        and(
          eq(operationalOccurrences.tenantId, tenantId),
          eq(operationalOccurrences.shiftId, shiftId),
        ),
      );
    const occurrenceEventLedger = occurrenceLedger.length
      ? await client
          .select({
            eventId: operationalOccurrenceEvents.id,
            occurrenceId: operationalOccurrenceEvents.occurrenceId,
            eventType: operationalOccurrenceEvents.eventType,
            amountCents: operationalOccurrenceEvents.amountCents,
            resultingStatus: operationalOccurrenceEvents.resultingStatus,
            resultingDecision: operationalOccurrenceEvents.resultingDecision,
            cashMovementId: operationalOccurrenceEvents.cashMovementId,
            reversesEventId: operationalOccurrenceEvents.reversesEventId,
            createdAt: operationalOccurrenceEvents.createdAt,
          })
          .from(operationalOccurrenceEvents)
          .where(
            and(
              eq(operationalOccurrenceEvents.tenantId, tenantId),
              inArray(
                operationalOccurrenceEvents.occurrenceId,
                occurrenceLedger.map((item) => item.occurrenceId),
              ),
            ),
          )
      : [];
    return payloadHash({
      orders: orderLedger.sort((left, right) =>
        `${left.orderId}:${left.itemId ?? ""}`.localeCompare(
          `${right.orderId}:${right.itemId ?? ""}`,
        ),
      ),
      payments: paymentLedger.sort((left, right) => left.paymentId.localeCompare(right.paymentId)),
      occurrences: occurrenceLedger.sort((left, right) =>
        left.occurrenceId.localeCompare(right.occurrenceId),
      ),
      occurrenceEvents: occurrenceEventLedger.sort((left, right) =>
        left.eventId.localeCompare(right.eventId),
      ),
    });
  }
  private frozenPoolWeights(rules: Record<string, unknown> | undefined, participantIds: string[]) {
    const configured = Array.isArray(rules?.weights)
      ? rules.weights.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const value = entry as Record<string, unknown>;
          return typeof value.userId === "string" && typeof value.weight === "number"
            ? [{ userId: value.userId, weight: value.weight }]
            : [];
        })
      : [];
    const allowed = new Set(participantIds);
    const weights = configured.filter((entry) => allowed.has(entry.userId) && entry.weight > 0);
    return (
      weights.length ? weights : participantIds.map((userId) => ({ userId, weight: 1 }))
    ).sort((left, right) => left.userId.localeCompare(right.userId));
  }
  private assertCommissionRules(
    model: CommissionPolicyInput["model"],
    rules: CommissionPolicyInput["rules"],
  ) {
    if (["fixed_rate", "rate_plus_bonus"].includes(model) && rules.rateBps === undefined)
      throw new BadRequestException("Informe a taxa da regra");
    if (
      ["target_bonus", "rate_plus_bonus"].includes(model) &&
      (rules.targetCents === undefined || rules.bonusCents === undefined)
    )
      throw new BadRequestException("Informe meta e bônus da regra");
    if (["whole_band", "progressive_bands"].includes(model) && !rules.bands?.length)
      throw new BadRequestException("Informe as faixas da regra");
    const bands = [...(rules.bands ?? [])].sort(
      (left, right) => left.startCents - right.startCents,
    );
    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];
      const previous = bands[index - 1];
      if (
        !band ||
        band.rateBps < 0 ||
        (band.endCents !== undefined && band.endCents <= band.startCents) ||
        (previous?.endCents !== undefined && band.startCents < previous.endCents)
      ) {
        throw new BadRequestException("As faixas da regra estão sobrepostas ou inválidas");
      }
    }
  }
  private assertCommissionPeriod(period: string, start: Date, end: Date) {
    const durationMs = end.getTime() - start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const isUtcMidnight = (value: Date) =>
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    const weekValid =
      period === "week" &&
      isUtcMidnight(start) &&
      start.getUTCDay() === 1 &&
      durationMs === 7 * dayMs;
    const nextMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    const monthValid =
      period === "month" &&
      isUtcMidnight(start) &&
      start.getUTCDate() === 1 &&
      end.getTime() === nextMonth.getTime();
    const shiftValid = period === "shift" && durationMs > 0 && durationMs <= 2 * dayMs;
    if (!shiftValid && !weekValid && !monthValid)
      throw new BadRequestException("O intervalo informado não corresponde ao período da regra");
  }
  private async assertEligibleMembers(
    client: typeof this.database.db,
    context: TenantContext,
    branchId: string,
    userIds: string[],
  ) {
    if (!userIds.length) return;
    const rows = await client
      .select({
        userId: users.id,
        active: users.isActive,
        roleId: userRoles.id,
        roleBranchId: userRoles.branchId,
      })
      .from(users)
      .leftJoin(
        userRoles,
        and(eq(userRoles.tenantId, context.tenantId), eq(userRoles.userId, users.id)),
      )
      .where(and(eq(users.tenantId, context.tenantId), inArray(users.id, userIds)));
    const eligible = new Set(
      rows
        .filter(
          (row) =>
            row.active &&
            row.roleId &&
            (row.roleBranchId === null || row.roleBranchId === branchId),
        )
        .map((row) => row.userId),
    );
    if (eligible.size !== new Set(userIds).size) {
      throw new BadRequestException(
        "Todos os participantes devem estar ativos e vinculados à filial",
      );
    }
  }
  private async assertEligiblePolicyMember(
    client: typeof this.database.db,
    context: TenantContext,
    policyId: string,
    branchId: string,
    userId: string,
  ) {
    await this.assertEligibleMembers(client, context, branchId, [userId]);
    const [member] = await client
      .select({ id: commissionPolicyMembers.id, override: commissionPolicyMembers.override })
      .from(commissionPolicyMembers)
      .where(
        and(
          eq(commissionPolicyMembers.tenantId, context.tenantId),
          eq(commissionPolicyMembers.policyId, policyId),
          eq(commissionPolicyMembers.userId, userId),
          eq(commissionPolicyMembers.eligible, true),
        ),
      )
      .limit(1);
    if (!member) throw new BadRequestException("Participante não é elegível para esta regra");
    return member;
  }
  private async findPolicy(
    context: TenantContext,
    branchId: string,
    client: typeof this.database.db,
  ) {
    const [policy] = await client
      .select()
      .from(staffServicePolicies)
      .where(
        and(
          eq(staffServicePolicies.tenantId, context.tenantId),
          eq(staffServicePolicies.branchId, branchId),
          eq(staffServicePolicies.isActive, true),
        ),
      )
      .limit(1);
    return policy ?? null;
  }
  private async confirmedPaid(client: typeof this.database.db, tenantId: string, orderId?: string) {
    if (!orderId) return 0;
    const [row] = await client
      .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.orderId, orderId),
          eq(payments.status, "confirmed"),
        ),
      );
    return Number(row?.total ?? 0);
  }
  private async sumRecordPayments(
    client: typeof this.database.db,
    tenantId: string,
    accrualId: string,
  ) {
    const [row] = await client
      .select({
        total: sql<number>`coalesce(sum(${commissionPaymentRecords.amountCents}), 0)::int`,
      })
      .from(commissionPaymentRecords)
      .where(
        and(
          eq(commissionPaymentRecords.tenantId, tenantId),
          eq(commissionPaymentRecords.accrualId, accrualId),
        ),
      );
    return Number(row?.total ?? 0);
  }
  private async reserveOperation(
    client: typeof this.database.db,
    context: TenantContext,
    branchId: string,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    const [created] = await client
      .insert(operationIdempotency)
      .values({ tenantId: context.tenantId, branchId, scope, idempotencyKey, requestHash })
      .onConflictDoNothing()
      .returning();
    if (created) return null;
    const [existing] = await client
      .select()
      .from(operationIdempotency)
      .where(
        and(
          eq(operationIdempotency.tenantId, context.tenantId),
          eq(operationIdempotency.branchId, branchId),
          eq(operationIdempotency.scope, scope),
          eq(operationIdempotency.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!existing || existing.requestHash !== requestHash)
      throw new ConflictException("A chave de idempotência foi reutilizada com outro conteúdo");
    if (existing.status !== "completed" || !existing.response)
      throw new ConflictException("A operação com esta chave ainda está em processamento");
    return existing.response;
  }
  private async completeOperation(
    client: typeof this.database.db,
    context: TenantContext,
    branchId: string,
    scope: string,
    idempotencyKey: string,
    response: Record<string, unknown>,
  ) {
    await client
      .update(operationIdempotency)
      .set({ status: "completed", response, completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(operationIdempotency.tenantId, context.tenantId),
          eq(operationIdempotency.branchId, branchId),
          eq(operationIdempotency.scope, scope),
          eq(operationIdempotency.idempotencyKey, idempotencyKey),
        ),
      );
  }
  private async audit(
    context: TenantContext,
    branchId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
    client: typeof this.database.db = this.database.db,
  ) {
    await client.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId,
      userId: context.userId ?? null,
      requestId: context.requestId,
      action,
      entityType,
      entityId,
      metadata,
    });
  }
}

function policySnapshot(policy: {
  id: string;
  version: number;
  attributionMode: string;
  serviceRateBps?: number;
  serviceBase?: string;
  poolRules?: Record<string, unknown>;
  model?: string;
  period?: string;
  base?: string;
  rules?: Record<string, unknown>;
}) {
  return {
    policyId: policy.id,
    version: policy.version,
    attributionMode: policy.attributionMode,
    serviceRateBps: policy.serviceRateBps,
    serviceBase: policy.serviceBase,
    poolRules: policy.poolRules,
    model: policy.model,
    period: policy.period,
    base: policy.base,
    rules: policy.rules,
  };
}
