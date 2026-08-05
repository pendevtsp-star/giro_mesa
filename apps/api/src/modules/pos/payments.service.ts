import { createHash } from "node:crypto";
import {
  auditLogs,
  cashSessions,
  orderItems,
  orders,
  paymentAllocations,
  payments,
} from "@giromesa/db";
import type { PaymentMethod, TenantContext } from "@giromesa/domain";
import { splitAmount, stateMachines } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { summarizeNetChargeAllocations } from "../../common/payment-ledger";
import { DatabaseService } from "../database/database.service";
import {
  type OperationalPaymentResult,
  operationalPaymentExecutor,
} from "./operational-payment-executor";
import { OrderRepository } from "./order.repository";
import { resolveCashHandoverStatus } from "./payment-handover";
import { PaymentSettingsService } from "./payment-settings.service";
import { WaiterAssignmentService } from "./waiter-assignment.service";

export type RegisterPaymentInput = {
  amountCents: number;
  method: PaymentMethod;
  idempotencyKey: string;
  registeredVia?: "waiter" | "cashier" | undefined;
  reference?: string | undefined;
  allocations?: PaymentAllocationInput[] | undefined;
  executionMode?: "manual" | "smartpos" | "tef" | undefined;
  terminalDeviceId?: string | undefined;
  simulatorScenario?: "authorized" | "denied" | "unknown" | "timeout" | undefined;
  managerOverride?: boolean | undefined;
  overrideReason?: string | undefined;
};

type PaymentAllocationInput = {
  orderItemId?: string | undefined;
  seatLabel?: string | undefined;
  amountCents: number;
  idempotencyKey: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
    @Optional()
    @Inject(WaiterAssignmentService)
    private readonly waiterAssignments?: WaiterAssignmentService,
    @Optional()
    @Inject(PaymentSettingsService)
    private readonly paymentSettings?: PaymentSettingsService,
  ) {}

  async registerPayment(context: TenantContext, orderId: string, input: RegisterPaymentInput) {
    if ((input.executionMode ?? "manual") !== "manual") {
      return this.createPaymentIntent(context, orderId, input);
    }
    const registeredVia = input.registeredVia ?? "cashier";
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${orderId}`}, 0))`,
      );
      const existingPayment = await this.orderRepository.findPaymentByIdempotencyKey(
        context,
        input.idempotencyKey,
        tx,
      );
      if (existingPayment) {
        assertIdempotentPaymentMatch(existingPayment, orderId, input, registeredVia);
        const order = await this.orderRepository.findOrderById(context, orderId, tx);
        if (!order) {
          throw new NotFoundException("Order not found");
        }
        return paymentResponse(existingPayment, order.status);
      }

      const order = await this.orderRepository.findOrderById(context, orderId, tx);

      if (!order) {
        throw new NotFoundException("Order not found");
      }
      await this.waiterAssignments?.assertOrderAccess(context, order, tx);
      if (order.closedAt) {
        throw new BadRequestException("Closed order cannot receive payments");
      }

      const unresolved =
        "select" in tx
          ? await tx
              .select({ id: payments.id })
              .from(payments)
              .where(
                and(
                  eq(payments.tenantId, context.tenantId),
                  eq(payments.orderId, orderId),
                  eq(payments.paymentType, "charge"),
                  eq(payments.status, "unknown"),
                ),
              )
              .limit(1)
          : [];
      if (unresolved.length && !input.managerOverride) {
        throw new ConflictException("Resolve the unknown payment before recording another charge");
      }
      if (unresolved.length && (!input.overrideReason || input.overrideReason.trim().length < 8)) {
        throw new BadRequestException("Manager override requires a reason");
      }

      await validatePaymentAllocations(context, orderId, input, tx);

      const allocationSignature = paymentAllocationSignature(input.allocations);

      const payment = await this.orderRepository.insertPayment(
        context,
        {
          branchId: order.branchId,
          orderId,
          provider: "manual",
          method: input.method,
          status: "confirmed",
          executionMode: "manual",
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
          registeredByUserId: requireUserId(context),
          registeredVia,
          cashHandoverStatus: resolveCashHandoverStatus(input.method, registeredVia),
          metadata: {
            ...(input.reference ? { reference: input.reference } : {}),
            ...(allocationSignature ? { allocationSignature } : {}),
          },
          confirmedAt: new Date(),
        },
        tx,
      );

      if (!payment) {
        const concurrentPayment = await this.orderRepository.findPaymentByIdempotencyKey(
          context,
          input.idempotencyKey,
          tx,
        );
        if (!concurrentPayment) {
          throw new Error("Failed to register payment");
        }
        assertIdempotentPaymentMatch(concurrentPayment, orderId, input, registeredVia);
        return paymentResponse(concurrentPayment, order.status);
      }

      if (input.allocations?.length) {
        await tx.insert(paymentAllocations).values(
          input.allocations.map((allocation) => ({
            tenantId: context.tenantId,
            branchId: order.branchId,
            orderId,
            paymentId: payment.id,
            orderItemId: allocation.orderItemId ?? null,
            seatLabel: allocation.seatLabel?.trim() ?? null,
            amountCents: allocation.amountCents,
            allocatedByUserId: requireUserId(context),
            idempotencyKey: allocation.idempotencyKey,
          })),
        );
      }

      const confirmedPayments = await this.orderRepository.findPaymentsByOrder(
        context,
        orderId,
        tx,
      );
      const paidCents = summarizeNetChargeAllocations(confirmedPayments).totalCents;
      if (paidCents > order.totalCents) {
        throw new BadRequestException("Payment exceeds the outstanding order balance");
      }
      const nextStatus = paidCents >= order.totalCents ? "paid" : "partially_paid";

      const updatedOrder = await this.orderRepository.updateOrder(
        context,
        order.id,
        {
          status: nextStatus,
          version: order.version + 1,
        },
        order.version,
        tx,
      );
      if (!updatedOrder) {
        throw new ConflictException("Order was updated concurrently");
      }

      const openCashSession = await this.orderRepository.findCashSession(
        context,
        order.branchId,
        tx,
      );

      if (openCashSession && payment.cashHandoverStatus === "received") {
        await this.orderRepository.updateCashSession(
          context,
          openCashSession.id,
          {
            expectedAmountCents: openCashSession.expectedAmountCents + payment.amountCents,
          },
          tx,
        );
      }

      await this.orderRepository.insertAuditLog(
        context,
        {
          branchId: order.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "payment.confirmed",
          entityType: "order",
          entityId: order.id,
          metadata: {
            paymentId: payment.id,
            method: payment.method,
            amountCents: payment.amountCents,
            orderStatus: nextStatus,
            registeredVia: payment.registeredVia,
            cashHandoverStatus: payment.cashHandoverStatus,
            ...(unresolved.length
              ? { managerOverride: true, overrideReason: input.overrideReason?.trim() }
              : {}),
          },
        },
        tx,
      );

      await this.orderRepository.insertOutboxEvent(
        context,
        {
          topic: "payment.confirmed",
          payload: {
            paymentId: payment.id,
            orderId: order.id,
            branchId: order.branchId,
            amountCents: payment.amountCents,
            method: payment.method,
            status: payment.status,
            orderStatus: nextStatus,
            registeredVia: payment.registeredVia,
            cashHandoverStatus: payment.cashHandoverStatus,
          },
        },
        tx,
      );

      return paymentResponse(payment, nextStatus);
    });
  }

  async createPaymentIntent(context: TenantContext, orderId: string, input: RegisterPaymentInput) {
    const mode = input.executionMode ?? "manual";
    if (mode === "manual")
      throw new BadRequestException("Manual payments use the canonical order payment route");
    const registeredVia = input.registeredVia ?? "cashier";
    const pending = await this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${orderId}`}, 0))`,
      );
      const existing = await this.orderRepository.findPaymentByIdempotencyKey(
        context,
        input.idempotencyKey,
        tx,
      );
      if (existing) {
        assertIdempotentPaymentMatch(existing, orderId, input, registeredVia);
        return { ...existing, orderStatus: "open", audit: "payment.intent_replayed" };
      }
      const order = await this.orderRepository.findOrderById(context, orderId, tx);
      if (!order) throw new NotFoundException("Order not found");
      await this.waiterAssignments?.assertOrderAccess(context, order, tx);
      if (order.closedAt) throw new BadRequestException("Closed order cannot receive payments");
      const [unknown] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.orderId, orderId),
            eq(payments.paymentType, "charge"),
            eq(payments.status, "unknown"),
          ),
        )
        .limit(1);
      if (unknown) throw new ConflictException("Resolve the unknown payment before trying again");
      if (!input.terminalDeviceId)
        throw new BadRequestException("Integrated payment requires a terminal");
      await this.paymentSettings?.assertTerminal(context, order.branchId, input.terminalDeviceId);
      const currentPayments = await this.orderRepository.findPaymentsByOrder(context, orderId, tx);
      const paidCents = summarizeNetChargeAllocations(currentPayments).totalCents;
      if (paidCents + input.amountCents > order.totalCents)
        throw new BadRequestException("Payment exceeds the outstanding order balance");
      const payment = await this.orderRepository.insertPayment(
        context,
        {
          branchId: order.branchId,
          orderId,
          provider: input.simulatorScenario ? "local_simulator" : mode,
          method: input.method,
          status: "pending",
          executionMode: mode,
          terminalDeviceId: input.terminalDeviceId,
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
          registeredByUserId: requireUserId(context),
          registeredVia,
          metadata: {
            ...(input.reference ? { reference: input.reference } : {}),
            ...(input.simulatorScenario ? { simulatorScenario: input.simulatorScenario } : {}),
          },
        },
        tx,
      );
      if (!payment) throw new ConflictException("Payment intent was created concurrently");
      await this.orderRepository.insertAuditLog(
        context,
        {
          branchId: order.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "payment.intent_created",
          entityType: "payment",
          entityId: payment.id,
          metadata: { orderId, mode, amountCents: input.amountCents },
        },
        tx,
      );
      return payment;
    });
    const executor = operationalPaymentExecutor(mode, Boolean(input.simulatorScenario));
    let result: OperationalPaymentResult;
    if (input.simulatorScenario === "authorized")
      result = { status: "confirmed" as const, providerReference: `sim-${pending.id}` };
    else if (input.simulatorScenario === "denied")
      result = { status: "failed" as const, providerReference: `sim-${pending.id}` };
    else if (input.simulatorScenario === "timeout" || input.simulatorScenario === "unknown")
      result = { status: "unknown" as const, providerReference: `sim-${pending.id}` };
    else
      result = await executor.initiate({
        id: pending.id,
        executionMode: mode,
        environment: normalizeNodeEnvironment(),
        amountCents: pending.amountCents,
      });
    if (result.status === "not_configured") {
      await this.updatePaymentResult(context, pending.id, "failed", result.providerReference);
      throw new ServiceUnavailableException(`${mode.toUpperCase()} is not configured`);
    }
    return this.updatePaymentResult(context, pending.id, result.status, result.providerReference);
  }

  async getPayment(context: TenantContext, paymentId: string) {
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
      .limit(1);
    if (!payment || (context.branchId && payment.branchId !== context.branchId))
      throw new NotFoundException("Payment not found");
    return payment;
  }

  async queryPayment(context: TenantContext, paymentId: string, input: { idempotencyKey: string }) {
    const payment = await this.getPayment(context, paymentId);
    if (!payment.orderId) throw new BadRequestException("Operational payment order is required");
    if (!["unknown", "pending"].includes(payment.status)) return payment;
    const scenario = payment.metadata?.simulatorScenario;
    const simulator = payment.provider === "local_simulator";
    const executor = operationalPaymentExecutor(
      payment.executionMode as "manual" | "smartpos" | "tef",
      simulator,
    );
    const result = await executor.query({
      id: payment.id,
      executionMode: payment.executionMode as "manual" | "smartpos" | "tef",
      environment: normalizeNodeEnvironment(),
      amountCents: payment.amountCents,
    });
    const status = scenario === "denied" ? "failed" : result.status;
    return this.updatePaymentResult(context, payment.id, status, result.providerReference, true);
  }

  async cancelPayment(
    context: TenantContext,
    paymentId: string,
    input: { idempotencyKey: string; reason?: string | undefined },
  ) {
    const payment = await this.getPayment(context, paymentId);
    if (!["pending", "unknown"].includes(payment.status))
      throw new ConflictException("Only pending or unknown payments can be canceled");
    const executor = operationalPaymentExecutor(
      payment.executionMode as "manual" | "smartpos" | "tef",
      payment.provider === "local_simulator",
    );
    const result = await executor.cancel({
      id: payment.id,
      executionMode: payment.executionMode as "manual" | "smartpos" | "tef",
      environment: normalizeNodeEnvironment(),
      amountCents: payment.amountCents,
    });
    if (result.status === "not_configured")
      throw new ServiceUnavailableException("Payment provider is not configured");
    return this.updatePaymentResult(
      context,
      payment.id,
      "canceled",
      result.providerReference,
      true,
    );
  }

  async refundPayment(
    context: TenantContext,
    paymentId: string,
    input: {
      idempotencyKey: string;
      amountCents?: number | undefined;
      reason?: string | undefined;
    },
  ) {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`refund:${context.tenantId}:${paymentId}`}, 0))`,
      );
      const [selectedOriginal] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
        .limit(1);
      const legacySelection = selectedOriginal as
        | { payment?: typeof payments.$inferSelect; orderBranchId?: string | null }
        | undefined;
      const original = legacySelection?.payment ?? selectedOriginal;
      if (
        original &&
        context.branchId &&
        original.branchId !== context.branchId &&
        legacySelection?.orderBranchId !== context.branchId
      ) {
        throw new ForbiddenException("Payment does not belong to this branch");
      }
      if (original?.paymentType !== "charge" || original.status !== "confirmed")
        throw new BadRequestException("Only confirmed charge payments can be refunded");
      if (original.provider === "asaas")
        throw new BadRequestException(
          "Asaas is reserved for platform subscriptions; operational payments cannot be refunded through Asaas",
        );
      if (!original.branchId || (context.branchId && original.branchId !== context.branchId))
        throw new NotFoundException("Payment not found");
      const [existing] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      const amountCents = input.amountCents ?? original.amountCents;
      const normalizedReason = input.reason?.trim() || "Refund";
      const refundRequestHash = createHash("sha256")
        .update(
          JSON.stringify({
            tenantId: context.tenantId,
            branchId: original.branchId,
            originalPaymentId: original.id,
            amountCents,
            reason: normalizedReason,
          }),
        )
        .digest("hex");
      if (existing) {
        if (
          existing.paymentType !== "refund" ||
          existing.originalPaymentId !== original.id ||
          existing.amountCents !== amountCents ||
          existing.metadata.refundRequestHash !== refundRequestHash
        )
          throw new ConflictException("Idempotency key was reused with a different refund payload");
        return {
          ...existing,
          accepted: true,
          duplicate: true,
          refundId: existing.id,
        };
      }
      const previous = await tx
        .select({ amountCents: payments.amountCents })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.originalPaymentId, original.id),
            eq(payments.paymentType, "refund"),
            eq(payments.status, "refunded"),
          ),
        );
      const refundedCents = previous.reduce((sum, row) => sum + row.amountCents, 0);
      if (amountCents <= 0 || refundedCents + amountCents > original.amountCents)
        throw new BadRequestException("Refund exceeds the available payment amount");
      if (
        (original.executionMode ?? "manual") !== "manual" &&
        original.provider !== "local_simulator"
      )
        throw new ServiceUnavailableException("Integrated refund provider is not configured");
      const [refund] = await tx
        .insert(payments)
        .values({
          tenantId: context.tenantId,
          branchId: original.branchId,
          orderId: original.orderId,
          provider: original.provider,
          method: original.method,
          status: "refunded",
          executionMode: original.executionMode,
          terminalDeviceId: original.terminalDeviceId,
          originalPaymentId: original.id,
          paymentType: "refund",
          amountCents,
          idempotencyKey: input.idempotencyKey,
          registeredByUserId: requireUserId(context),
          registeredVia: original.registeredVia,
          metadata: {
            reason: normalizedReason,
            originalPaymentId: original.id,
            refundRequestHash,
          },
          confirmedAt: new Date(),
        })
        .returning();
      if (!refund) throw new Error("Failed to create refund");
      await tx
        .update(payments)
        .set({
          status:
            refundedCents + amountCents === original.amountCents
              ? "refunded"
              : "partially_refunded",
          version: original.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.id, original.id),
            eq(payments.version, original.version),
          ),
        );
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: original.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "payment.refunded",
        entityType: "payment",
        entityId: refund.id,
        metadata: { originalPaymentId: original.id, amountCents, reason: input.reason },
      });
      return {
        ...refund,
        amountCents,
        accepted: true,
        duplicate: false,
        refundId: refund.id,
      };
    });
  }

  private async updatePaymentResult(
    context: TenantContext,
    paymentId: string,
    result: "confirmed" | "failed" | "unknown" | "canceled" | "not_configured",
    providerReference?: string,
    queried = false,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
        .limit(1);
      if (!payment?.orderId || !payment.branchId) throw new NotFoundException("Payment not found");
      if (payment.status === "confirmed" || payment.status === "canceled")
        return {
          ...payment,
          orderStatus: payment.status === "confirmed" ? "paid" : "open",
          audit: `payment.${payment.status}`,
        };
      const mappedStatus = result === "not_configured" ? "failed" : result;
      const now = new Date();
      const [updated] = await tx
        .update(payments)
        .set({
          status: mappedStatus,
          providerReference: providerReference ?? payment.providerReference,
          resultUnknownAt: mappedStatus === "unknown" ? now : null,
          lastQueriedAt: queried ? now : payment.lastQueriedAt,
          confirmedAt: mappedStatus === "confirmed" ? now : payment.confirmedAt,
          version: payment.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.id, payment.id),
            eq(payments.version, payment.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("Payment was updated concurrently");
      let orderStatus = "open";
      if (mappedStatus === "confirmed") {
        const order = await this.orderRepository.findOrderById(context, payment.orderId, tx);
        if (!order) throw new NotFoundException("Order not found");
        const allPayments = await this.orderRepository.findPaymentsByOrder(
          context,
          payment.orderId,
          tx,
        );
        const paidCents = summarizeNetChargeAllocations(allPayments).totalCents;
        if (paidCents > order.totalCents)
          throw new ConflictException("Confirmed payments exceed the order total");
        orderStatus = paidCents >= order.totalCents ? "paid" : "partially_paid";
        await this.orderRepository.updateOrder(
          context,
          order.id,
          { status: orderStatus as "paid" | "partially_paid", version: order.version + 1 },
          order.version,
          tx,
        );
      }
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: payment.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: `payment.${mappedStatus}`,
        entityType: "payment",
        entityId: payment.id,
        metadata: { previousStatus: payment.status, providerReference: providerReference ?? null },
      });
      return { ...updated, orderStatus, audit: `payment.${mappedStatus}` };
    });
  }

  async listOrderPayments(context: TenantContext, orderId: string) {
    const order = await this.orderRepository.findOrderById(context, orderId);

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const rows = await this.orderRepository.findPaymentsByOrder(context, orderId);

    return rows.map((row) => ({
      ...row,
      audit: row.status === "confirmed" ? "payment.confirmed" : "payment.recorded",
    }));
  }

  async receiveCashHandover(context: TenantContext, paymentId: string) {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          payment: payments,
          orderBranchId: orders.branchId,
        })
        .from(payments)
        .innerJoin(
          orders,
          and(eq(orders.tenantId, context.tenantId), eq(orders.id, payments.orderId)),
        )
        .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
        .limit(1);
      if (!row) throw new NotFoundException("Payment not found");
      const branchId = row.payment.branchId ?? row.orderBranchId;
      if (!context.branchId || context.branchId !== branchId) {
        throw new NotFoundException("Payment not found");
      }
      if (row.payment.cashHandoverStatus === "received") {
        return { ...row.payment, audit: "cash_handover.received" };
      }
      if (row.payment.cashHandoverStatus !== "pending") {
        throw new BadRequestException("Payment does not require cash handover");
      }
      stateMachines.assertCashHandoverTransition(row.payment.cashHandoverStatus, "received");
      const now = new Date();
      const [received] = await tx
        .update(payments)
        .set({
          cashHandoverStatus: "received",
          cashHandoverReceivedByUserId: requireUserId(context),
          cashHandoverReceivedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.id, paymentId),
            eq(payments.cashHandoverStatus, "pending"),
          ),
        )
        .returning();
      if (!received) {
        const [current] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
          .limit(1);
        if (current?.cashHandoverStatus === "received") {
          return { ...current, audit: "cash_handover.received" };
        }
        throw new ConflictException("Cash handover was updated concurrently");
      }
      const [session] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, context.tenantId),
            eq(cashSessions.branchId, branchId),
            eq(cashSessions.status, "open"),
          ),
        )
        .limit(1);
      if (session) {
        await tx
          .update(cashSessions)
          .set({
            expectedAmountCents: session.expectedAmountCents + received.amountCents,
            updatedAt: now,
          })
          .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, session.id)));
      }
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "cash_handover.received",
        entityType: "payment",
        entityId: received.id,
        metadata: {
          amountCents: received.amountCents,
          registeredByUserId: received.registeredByUserId,
          receivedByUserId: received.cashHandoverReceivedByUserId,
        },
      });
      return { ...received, audit: "cash_handover.received" };
    });
  }

  async splitBill(context: TenantContext, orderId: string, people: number) {
    const order = await this.orderRepository.findOrderById(context, orderId);
    if (!order) throw new NotFoundException("Order not found");
    return {
      orderId,
      totalCents: order.totalCents,
      parts: splitAmount(order.totalCents, people).map((amountCents, index) => ({
        person: index + 1,
        amountCents,
      })),
    };
  }
}

function requireUserId(context: TenantContext) {
  if (!context.userId) {
    throw new BadRequestException("Authenticated user is required");
  }
  return context.userId;
}

type PersistedPayment = NonNullable<
  Awaited<ReturnType<OrderRepository["findPaymentByIdempotencyKey"]>>
>;

function assertIdempotentPaymentMatch(
  payment: PersistedPayment,
  orderId: string,
  input: RegisterPaymentInput,
  registeredVia: "waiter" | "cashier",
) {
  const reference =
    payment.metadata && typeof payment.metadata.reference === "string"
      ? payment.metadata.reference
      : undefined;
  const allocationSignature =
    payment.metadata && typeof payment.metadata.allocationSignature === "string"
      ? payment.metadata.allocationSignature
      : undefined;
  if (
    payment.orderId !== orderId ||
    payment.amountCents !== input.amountCents ||
    payment.method !== input.method ||
    payment.registeredVia !== registeredVia ||
    (payment.executionMode ?? "manual") !== (input.executionMode ?? "manual") ||
    (payment.terminalDeviceId ?? null) !== (input.terminalDeviceId ?? null) ||
    reference !== input.reference ||
    allocationSignature !== paymentAllocationSignature(input.allocations)
  ) {
    throw new ConflictException("Idempotency key was already used with a different payment");
  }
}

function normalizeNodeEnvironment(): "development" | "test" | "production" {
  return process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";
}

function paymentAllocationSignature(allocations: PaymentAllocationInput[] | undefined) {
  if (!allocations?.length) return undefined;
  return JSON.stringify(
    allocations
      .map((row) => ({
        orderItemId: row.orderItemId ?? null,
        seatLabel: row.seatLabel?.trim() ?? null,
        amountCents: row.amountCents,
        idempotencyKey: row.idempotencyKey,
      }))
      .sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey)),
  );
}

async function validatePaymentAllocations(
  context: TenantContext,
  orderId: string,
  input: RegisterPaymentInput,
  tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
) {
  const allocations = input.allocations ?? [];
  if (!allocations.length) return;
  const allocatedAmount = allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (allocatedAmount !== input.amountCents) {
    throw new BadRequestException("Payment allocations must equal the payment amount");
  }
  if (
    allocations.some(
      (row) => row.amountCents <= 0 || Boolean(row.orderItemId) === Boolean(row.seatLabel?.trim()),
    )
  ) {
    throw new BadRequestException("Each allocation must target exactly one item or person");
  }

  const keys = allocations.map((row) => row.idempotencyKey);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException("Payment allocation idempotency keys must be unique");
  }
  const existingKeys = await tx
    .select({ id: paymentAllocations.id })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.tenantId, context.tenantId),
        inArray(paymentAllocations.idempotencyKey, keys),
      ),
    )
    .limit(1);
  if (existingKeys.length) {
    throw new ConflictException("Payment allocation key was already used");
  }

  const requestedItemIds = [...new Set(allocations.flatMap((row) => row.orderItemId ?? []))];
  if (!requestedItemIds.length) return;
  const items = await tx
    .select({ id: orderItems.id, totalCents: orderItems.totalCents, status: orderItems.status })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.tenantId, context.tenantId),
        eq(orderItems.orderId, orderId),
        inArray(orderItems.id, requestedItemIds),
      ),
    );
  if (
    items.length !== requestedItemIds.length ||
    items.some((item) => item.status === "canceled")
  ) {
    throw new BadRequestException("One or more allocated items are unavailable");
  }
  const previous = await tx
    .select({
      orderItemId: paymentAllocations.orderItemId,
      amountCents: paymentAllocations.amountCents,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.tenantId, context.tenantId),
        eq(paymentAllocations.orderId, orderId),
        inArray(paymentAllocations.orderItemId, requestedItemIds),
      ),
    );
  const previouslyAllocated = new Map<string, number>();
  for (const row of previous) {
    if (row.orderItemId)
      previouslyAllocated.set(
        row.orderItemId,
        (previouslyAllocated.get(row.orderItemId) ?? 0) + row.amountCents,
      );
  }
  const requested = new Map<string, number>();
  for (const row of allocations) {
    if (row.orderItemId)
      requested.set(row.orderItemId, (requested.get(row.orderItemId) ?? 0) + row.amountCents);
  }
  for (const item of items) {
    if ((previouslyAllocated.get(item.id) ?? 0) + (requested.get(item.id) ?? 0) > item.totalCents) {
      throw new BadRequestException("Payment allocation exceeds an order item balance");
    }
  }
}

function paymentResponse(payment: PersistedPayment, orderStatus: string) {
  return {
    ...payment,
    orderStatus,
    audit: "payment.confirmed",
  };
}
