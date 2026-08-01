import { auditLogs, cashSessions, orders, payments } from "@giromesa/db";
import type { PaymentMethod, TenantContext } from "@giromesa/domain";
import { splitAmount, stateMachines } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { OrderRepository } from "./order.repository";
import { resolveCashHandoverStatus } from "./payment-handover";

type RegisterPaymentInput = {
  amountCents: number;
  method: PaymentMethod;
  idempotencyKey: string;
  registeredVia?: "waiter" | "cashier" | undefined;
  reference?: string | undefined;
};

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
  ) {}

  async registerPayment(context: TenantContext, orderId: string, input: RegisterPaymentInput) {
    const registeredVia = input.registeredVia ?? "cashier";
    return this.database.db.transaction(async (tx) => {
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
      if (order.closedAt) {
        throw new BadRequestException("Closed order cannot receive payments");
      }

      const payment = await this.orderRepository.insertPayment(
        context,
        {
          branchId: order.branchId,
          orderId,
          provider: "manual",
          method: input.method,
          status: "confirmed",
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
          registeredByUserId: requireUserId(context),
          registeredVia,
          cashHandoverStatus: resolveCashHandoverStatus(input.method, registeredVia),
          metadata: input.reference ? { reference: input.reference } : {},
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

      const confirmedPayments = await this.orderRepository.findPaymentsByOrder(
        context,
        orderId,
        tx,
      );
      const paidCents = confirmedPayments
        .filter((row) => row.status === "confirmed")
        .reduce((sum, row) => sum + row.amountCents, 0);
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
  if (
    payment.orderId !== orderId ||
    payment.amountCents !== input.amountCents ||
    payment.method !== input.method ||
    payment.registeredVia !== registeredVia ||
    reference !== input.reference
  ) {
    throw new ConflictException("Idempotency key was already used with a different payment");
  }
}

function paymentResponse(payment: PersistedPayment, orderStatus: string) {
  return {
    ...payment,
    orderStatus,
    audit: "payment.confirmed",
  };
}
