import { stateMachines, type TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CashRepository } from "./cash.repository";
import { PosRepository } from "./pos.repository";

export type CashSessionSummary = {
  branchId: string;
  session: {
    id: string;
    status: string;
    openingAmountCents: number;
    expectedAmountCents: number;
    countedAmountCents: number | null;
    differenceCents: number | null;
    openedAt: Date;
    closedAt: Date | null;
  } | null;
  payments: {
    totalCents: number;
    count: number;
    byMethod: Record<string, number>;
    pendingCount: number;
    pendingAmountCents: number;
    receivedAmountCents: number;
    disputedAmountCents: number;
    pendingHandovers: Array<{
      id: string;
      amountCents: number;
      registeredByUserId: string | null;
      createdAt: Date;
    }>;
  };
  movements: Array<{
    id: string;
    type: string;
    amountCents: number;
    reason: string;
    createdAt: Date;
  }>;
  openOrders: {
    count: number;
    totalCents: number;
  };
};

type OpenCashSessionInput = {
  branchId: string;
  openingAmountCents: number;
};

type CashMovementInput = {
  branchId: string;
  amountCents: number;
  reason: string;
};

type CloseCashSessionInput = {
  countedAmountCents: number;
};

@Injectable()
export class CashService {
  constructor(
    @Inject(CashRepository) private readonly cashRepository: CashRepository,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
  ) {}

  async getCurrentCashSession(context: TenantContext, branchId: string) {
    const summary = await this.getCashSessionSummary(context, branchId);
    return { branchId, session: summary.session, movements: summary.movements };
  }

  async openCashSession(context: TenantContext, input: OpenCashSessionInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const existing = await this.cashRepository.findOpenCashSession(context, input.branchId);
    if (existing) {
      throw new ConflictException("There is already an open cash session for this branch");
    }

    const session = await this.cashRepository.insertCashSession(context, {
      branchId: input.branchId,
      operatorId: context.userId ?? "",
      openingAmountCents: input.openingAmountCents,
      expectedAmountCents: input.openingAmountCents,
    });

    if (!session) {
      throw new BadRequestException("Unable to open cash session");
    }

    await this.cashRepository.insertAuditLog(context, {
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "cash_session.opened",
      entityType: "cash_session",
      entityId: session.id,
      metadata: { openingAmountCents: input.openingAmountCents },
    });

    return session;
  }

  async registerCashMovement(
    context: TenantContext,
    type: "supply" | "withdrawal",
    input: CashMovementInput,
  ) {
    if (input.amountCents <= 0) {
      throw new BadRequestException("Movement amount must be positive");
    }
    if (!input.reason.trim()) {
      throw new BadRequestException("Movement reason is required");
    }
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const session = await this.cashRepository.findCurrentCashSession(context, input.branchId);
    if (session?.status !== "open") {
      throw new BadRequestException("Open cash session is required");
    }

    const signedAmount = type === "supply" ? input.amountCents : -input.amountCents;
    const movement = await this.cashRepository.insertCashMovement(context, {
      branchId: input.branchId,
      cashSessionId: session.id,
      type,
      amountCents: input.amountCents,
      reason: input.reason.trim(),
      createdByUserId: context.userId ?? "",
    });

    await this.cashRepository.updateCashSession(context, session.id, {
      expectedAmountCents: session.expectedAmountCents + signedAmount,
    });

    if (!movement) {
      throw new BadRequestException("Unable to register cash movement");
    }

    await this.cashRepository.insertAuditLog(context, {
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "cash_movement.created",
      entityType: "cash_movement",
      entityId: movement.id,
      metadata: {
        cashSessionId: session.id,
        type,
        amountCents: input.amountCents,
        reason: input.reason.trim(),
      },
    });

    return { ...movement, audit: "cash_movement.created" };
  }

  async getCashSessionSummary(
    context: TenantContext,
    branchId: string,
  ): Promise<CashSessionSummary> {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const session = await this.cashRepository.findCurrentCashSession(context, branchId);

    const movements = session
      ? await this.cashRepository.findCashMovements(context, session.id)
      : [];

    const paymentRows = await this.cashRepository.findPaymentsByMethod(context, branchId, session);
    const cashHandovers = await this.cashRepository.findCashHandovers(context, branchId, session);

    const totalPayments = paymentRows.reduce((sum, row) => sum + Number(row.totalCents), 0);
    const totalPaymentCount = paymentRows.length;
    const byMethod = Object.fromEntries(
      paymentRows.map((row) => [row.method, Number(row.totalCents ?? 0)]),
    );
    const pendingHandovers = cashHandovers
      .filter((row) => row.status === "pending")
      .map((row) => ({
        id: row.id,
        amountCents: row.amountCents,
        registeredByUserId: row.registeredByUserId,
        createdAt: row.createdAt,
      }));

    const { count, totalCents } = await this.cashRepository.countOpenOrders(context, branchId);

    return {
      branchId,
      session: session
        ? {
            id: session.id,
            status: session.status,
            openingAmountCents: session.openingAmountCents,
            expectedAmountCents: session.expectedAmountCents,
            countedAmountCents: session.countedAmountCents,
            differenceCents:
              session.countedAmountCents === null
                ? null
                : session.countedAmountCents - session.expectedAmountCents,
            openedAt: session.openedAt,
            closedAt: session.closedAt,
          }
        : null,
      payments: {
        totalCents: totalPayments,
        count: totalPaymentCount,
        byMethod,
        pendingCount: pendingHandovers.length,
        pendingAmountCents: sumHandover(cashHandovers, "pending"),
        receivedAmountCents: sumHandover(cashHandovers, "received"),
        disputedAmountCents: sumHandover(cashHandovers, "disputed"),
        pendingHandovers,
      },
      movements,
      openOrders: {
        count,
        totalCents,
      },
    };
  }

  async closeCashSession(
    context: TenantContext,
    cashSessionId: string,
    input: CloseCashSessionInput,
  ) {
    const session = await this.cashRepository.findCashSessionById(context, cashSessionId);

    if (!session) {
      throw new NotFoundException("Cash session not found");
    }
    await this.posRepository.ensureBranchBelongsToTenant(context, session.branchId);

    if (session.status !== "open") {
      throw new BadRequestException("Cash session is no longer open");
    }

    const { count } = await this.cashRepository.countOpenOrders(context, session.branchId);

    if (count > 0) {
      throw new BadRequestException("Close or settle open orders before closing the cash session");
    }

    const nextStatus =
      input.countedAmountCents === session.expectedAmountCents ? "closed" : "disputed";
    stateMachines.assertCashSessionTransition(session.status, nextStatus);
    const differenceCents = input.countedAmountCents - session.expectedAmountCents;

    const closed = await this.cashRepository.updateCashSession(context, session.id, {
      status: nextStatus,
      countedAmountCents: input.countedAmountCents,
      closedAt: new Date(),
    });

    await this.cashRepository.insertAuditLog(context, {
      branchId: session.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: nextStatus === "disputed" ? "cash_session.disputed" : "cash_session.closed",
      entityType: "cash_session",
      entityId: session.id,
      metadata: {
        openingAmountCents: session.openingAmountCents,
        expectedAmountCents: session.expectedAmountCents,
        countedAmountCents: input.countedAmountCents,
        differenceCents,
      },
    });

    await this.cashRepository.insertOutboxEvent(context, {
      topic: "cash_session.closed",
      payload: {
        cashSessionId: session.id,
        branchId: session.branchId,
        status: nextStatus,
        expectedAmountCents: session.expectedAmountCents,
        countedAmountCents: input.countedAmountCents,
        differenceCents,
        closedAt: new Date().toISOString(),
      },
    });

    return {
      ...closed,
      differenceCents,
      audit: nextStatus === "disputed" ? "cash_session.disputed" : "cash_session.closed",
    };
  }
}

function sumHandover(rows: Array<{ status: string; amountCents: number }>, status: string) {
  return rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountCents, 0);
}
