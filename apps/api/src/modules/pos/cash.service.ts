import { stateMachines, type TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
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

export function deriveExpectedCashAmountCents(input: {
  openingAmountCents: number;
  movements: Array<{ type: string; amountCents: number }>;
  handovers: Array<{ status: string; amountCents: number }>;
}) {
  const movementDelta = input.movements.reduce(
    (sum, movement) =>
      sum + (movement.type === "supply" ? movement.amountCents : -movement.amountCents),
    0,
  );
  const receivedCashDelta = input.handovers
    .filter((handover) => handover.status === "received")
    .reduce((sum, handover) => sum + handover.amountCents, 0);
  return input.openingAmountCents + movementDelta + receivedCashDelta;
}

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
  idempotencyKey?: string | undefined;
};

@Injectable()
export class CashService {
  constructor(
    @Inject(CashRepository) private readonly cashRepository: CashRepository,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getCurrentCashSession(context: TenantContext, branchId: string) {
    const summary = await this.getCashSessionSummary(context, branchId);
    return { branchId, session: summary.session, movements: summary.movements };
  }

  async openCashSession(context: TenantContext, input: OpenCashSessionInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    try {
      return await this.database.db.transaction(async (tx) => {
        const existing = await this.cashRepository.findOpenCashSession(context, input.branchId, tx);
        if (existing) {
          throw new ConflictException("There is already an open cash session for this branch");
        }

        const session = await this.cashRepository.insertCashSession(
          context,
          {
            branchId: input.branchId,
            operatorId: context.userId ?? "",
            openingAmountCents: input.openingAmountCents,
            expectedAmountCents: input.openingAmountCents,
          },
          tx,
        );
        if (!session) throw new BadRequestException("Unable to open cash session");

        await this.cashRepository.insertAuditLog(
          context,
          {
            branchId: input.branchId,
            userId: context.userId,
            requestId: context.requestId,
            action: "cash_session.opened",
            entityType: "cash_session",
            entityId: session.id,
            metadata: { openingAmountCents: input.openingAmountCents },
          },
          tx,
        );
        return session;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("There is already an open cash session for this branch");
      }
      throw error;
    }
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
    return this.database.db.transaction(async (tx) => {
      const session = await this.cashRepository.findOpenCashSessionForUpdate(
        context,
        input.branchId,
        tx,
      );
      if (!session) throw new BadRequestException("Open cash session is required");

      const signedAmount = type === "supply" ? input.amountCents : -input.amountCents;
      const movement = await this.cashRepository.insertCashMovement(
        context,
        {
          branchId: input.branchId,
          cashSessionId: session.id,
          type,
          amountCents: input.amountCents,
          reason: input.reason.trim(),
          createdByUserId: context.userId ?? "",
        },
        tx,
      );
      if (!movement) throw new BadRequestException("Unable to register cash movement");

      const updated = await this.cashRepository.updateCashSession(
        context,
        session.id,
        {
          expectedAmountCents: session.expectedAmountCents + signedAmount,
          version: session.version + 1,
        },
        session.version,
        tx,
      );
      if (!updated) throw new ConflictException("Cash session was updated concurrently");

      await this.cashRepository.insertAuditLog(
        context,
        {
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
        },
        tx,
      );
      return { ...movement, audit: "cash_movement.created" };
    });
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
    const derivedExpectedAmountCents = session
      ? deriveExpectedCashAmountCents({
          openingAmountCents: session.openingAmountCents,
          movements,
          handovers: cashHandovers,
        })
      : 0;

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
            expectedAmountCents: derivedExpectedAmountCents,
            countedAmountCents: session.countedAmountCents,
            differenceCents:
              session.countedAmountCents === null
                ? null
                : session.countedAmountCents - derivedExpectedAmountCents,
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
    const idempotencyKey = input.idempotencyKey ?? context.requestId;
    return this.database.db.transaction(async (tx) => {
      const replay = await this.cashRepository.findCashSessionByCloseKey(
        context,
        idempotencyKey,
        tx,
      );
      if (replay) {
        if (replay.id !== cashSessionId)
          throw new ConflictException("Idempotency key already used");
        return cashCloseResponse(replay, true);
      }

      const session = await this.cashRepository.findCashSessionByIdForUpdate(
        context,
        cashSessionId,
        tx,
      );
      if (!session) throw new NotFoundException("Cash session not found");
      await this.posRepository.ensureBranchBelongsToTenant(context, session.branchId);
      if (session.status !== "open") {
        throw new BadRequestException("Cash session is no longer open");
      }

      const { count } = await this.cashRepository.countOpenOrders(context, session.branchId, tx);
      if (count > 0) {
        throw new BadRequestException(
          "Close or settle open orders before closing the cash session",
        );
      }

      const handovers = await this.cashRepository.findCashHandovers(
        context,
        session.branchId,
        session,
        tx,
      );
      const movements = await this.cashRepository.findCashMovements(context, session.id, tx);
      const derivedExpectedAmountCents = deriveExpectedCashAmountCents({
        openingAmountCents: session.openingAmountCents,
        movements,
        handovers,
      });
      if (handovers.some((handover) => handover.status === "pending")) {
        throw new BadRequestException(
          "Confirme as entregas de dinheiro dos garçons antes de fechar o caixa",
        );
      }
      if (handovers.some((handover) => handover.status === "disputed")) {
        throw new BadRequestException(
          "Resolva as divergências de dinheiro antes de fechar o caixa",
        );
      }

      const nextStatus =
        input.countedAmountCents === derivedExpectedAmountCents ? "closed" : "disputed";
      stateMachines.assertCashSessionTransition(session.status, nextStatus);
      const differenceCents = input.countedAmountCents - derivedExpectedAmountCents;
      const closedAt = new Date();
      const closed = await this.cashRepository.updateCashSession(
        context,
        session.id,
        {
          status: nextStatus,
          expectedAmountCents: derivedExpectedAmountCents,
          countedAmountCents: input.countedAmountCents,
          closeIdempotencyKey: idempotencyKey,
          closedAt,
          version: session.version + 1,
        },
        session.version,
        tx,
      );
      if (!closed) throw new ConflictException("Cash session was closed concurrently");

      await this.cashRepository.insertAuditLog(
        context,
        {
          branchId: session.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: nextStatus === "disputed" ? "cash_session.disputed" : "cash_session.closed",
          entityType: "cash_session",
          entityId: session.id,
          metadata: {
            openingAmountCents: session.openingAmountCents,
            expectedAmountCents: derivedExpectedAmountCents,
            countedAmountCents: input.countedAmountCents,
            differenceCents,
          },
        },
        tx,
      );
      await this.cashRepository.insertOutboxEvent(
        context,
        {
          topic: "cash_session.closed",
          payload: {
            cashSessionId: session.id,
            branchId: session.branchId,
            status: nextStatus,
            expectedAmountCents: derivedExpectedAmountCents,
            countedAmountCents: input.countedAmountCents,
            differenceCents,
            closedAt: closedAt.toISOString(),
          },
        },
        tx,
      );
      return cashCloseResponse(closed, false);
    });
  }
}

function sumHandover(rows: Array<{ status: string; amountCents: number }>, status: string) {
  return rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountCents, 0);
}

function cashCloseResponse(
  session: { expectedAmountCents: number; countedAmountCents: number | null; status: string },
  replayed: boolean,
) {
  return {
    ...session,
    differenceCents: (session.countedAmountCents ?? 0) - session.expectedAmountCents,
    audit: session.status === "disputed" ? "cash_session.disputed" : "cash_session.closed",
    replayed,
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
