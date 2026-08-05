import {
  approvalRequests,
  branches,
  fiscalDocuments,
  integrationAccounts,
  outboxEvents,
  printJobs,
  tableWaiterAssignments,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  activeClubWhiskyAccountAppliesToBranch,
  readClubWhiskyBranchId,
} from "../integrations/club-whisky-branch";
import { StaffFinanceService } from "../staff-finance/staff-finance.service";
import { PosRepository } from "./pos.repository";
import { ShiftRepository } from "./shift.repository";

type OpenShiftInput = {
  branchId: string;
  notes?: string | undefined;
};

type CloseShiftInput = {
  branchId: string;
  notes?: string | undefined;
  idempotencyKey?: string | undefined;
};

@Injectable()
export class ShiftService {
  constructor(
    @Inject(ShiftRepository) private readonly shiftRepository: ShiftRepository,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(StaffFinanceService) private readonly staffFinance?: StaffFinanceService,
  ) {}

  async getCurrentShift(context: TenantContext, branchId: string) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const shift = await this.shiftRepository.findCurrentShift(context, branchId);
    return { branchId, shift: shift ?? null };
  }

  async openShift(context: TenantContext, input: OpenShiftInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    try {
      return await this.database.db.transaction(async (tx) => {
        const existing = await this.shiftRepository.findCurrentShift(context, input.branchId, tx);
        if (existing) {
          throw new ConflictException("There is already an open shift for this branch");
        }

        const shift = await this.shiftRepository.insertShift(
          context,
          {
            branchId: input.branchId,
            openedByUserId: context.userId ?? "",
            notes: input.notes ?? null,
            openingContext: { source: "pos" },
          },
          tx,
        );
        if (!shift) throw new BadRequestException("Unable to open shift");

        await this.posRepository.insertAuditLog(
          context,
          {
            branchId: input.branchId,
            userId: context.userId,
            requestId: context.requestId,
            action: "shift.opened",
            entityType: "operational_shift",
            entityId: shift.id,
            metadata: { notes: input.notes ?? null },
          },
          tx,
        );
        return { ...shift, audit: "shift.opened" };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("There is already an open shift for this branch");
      }
      throw error;
    }
  }

  async closeShift(context: TenantContext, input: CloseShiftInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const idempotencyKey = input.idempotencyKey ?? context.requestId;
    return this.database.db.transaction(async (tx) => {
      const replay = await this.shiftRepository.findShiftByCloseKey(context, idempotencyKey, tx);
      if (replay) return { ...replay, audit: "shift.closed", replayed: true };
      const shift = await this.shiftRepository.findCurrentShiftForUpdate(
        context,
        input.branchId,
        tx,
      );
      if (!shift) throw new NotFoundException("Open shift not found");
      await this.staffFinance?.assertCanCloseShift(context, shift.id, tx);
      const openCash = await this.shiftRepository.findOpenCashSession(context, input.branchId, tx);
      if (openCash)
        throw new BadRequestException("Close the cash session before closing the shift");
      const [pendingPrints, pendingFiscal] = await Promise.all([
        tx
          .select({ id: printJobs.id })
          .from(printJobs)
          .where(
            and(
              eq(printJobs.tenantId, context.tenantId),
              eq(printJobs.branchId, input.branchId),
              gte(printJobs.createdAt, shift.openedAt),
              inArray(printJobs.status, ["pending", "printing", "failed"]),
            ),
          )
          .limit(1),
        tx
          .select({ id: fiscalDocuments.id })
          .from(fiscalDocuments)
          .where(
            and(
              eq(fiscalDocuments.tenantId, context.tenantId),
              eq(fiscalDocuments.branchId, input.branchId),
              gte(fiscalDocuments.createdAt, shift.openedAt),
              inArray(fiscalDocuments.status, ["pending", "error"]),
            ),
          )
          .limit(1),
      ]);
      if (pendingPrints.length || pendingFiscal.length) {
        throw new BadRequestException(
          pendingPrints.length
            ? "Resolva ou reimprima os trabalhos de impressão pendentes antes de fechar o turno"
            : "Resolva os documentos fiscais pendentes antes de fechar o turno",
        );
      }
      const [activeClubIntegration] = await tx
        .select({ id: integrationAccounts.id, config: integrationAccounts.config })
        .from(integrationAccounts)
        .where(
          and(
            eq(integrationAccounts.tenantId, context.tenantId),
            eq(integrationAccounts.provider, "club_whisky"),
            eq(integrationAccounts.status, "active"),
          ),
        )
        .limit(1);
      if (activeClubIntegration) {
        const configuredBranchId = readClubWhiskyBranchId(activeClubIntegration.config);
        const ownedBranches = configuredBranchId
          ? await tx
              .select({ id: branches.id })
              .from(branches)
              .where(
                and(eq(branches.tenantId, context.tenantId), eq(branches.id, configuredBranchId)),
              )
              .limit(1)
          : [];
        const appliesToCurrentBranch = activeClubWhiskyAccountAppliesToBranch(
          activeClubIntegration.config,
          input.branchId,
          ownedBranches.map((branch) => branch.id),
        );
        if (!appliesToCurrentBranch) {
          return this.completeShiftClose(context, input, shift, idempotencyKey, tx);
        }
        const pendingOperationalOutbox = await tx
          .select({ id: outboxEvents.id })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.tenantId, context.tenantId),
              gte(outboxEvents.createdAt, shift.openedAt),
              inArray(outboxEvents.status, ["pending", "processing", "failed", "dead_letter"]),
              sql`${outboxEvents.payload}->>'integration' = 'club_whisky'`,
              sql`${outboxEvents.payload}->>'branchId' = ${input.branchId}`,
            ),
          )
          .limit(1);
        if (pendingOperationalOutbox.length) {
          throw new BadRequestException(
            "Reenvie ou descarte com justificativa os eventos pendentes do Dose Club antes de fechar o turno",
          );
        }
      }
      return this.completeShiftClose(context, input, shift, idempotencyKey, tx);
    });
  }

  private async completeShiftClose(
    context: TenantContext,
    input: CloseShiftInput,
    shift: NonNullable<Awaited<ReturnType<ShiftRepository["findCurrentShiftForUpdate"]>>>,
    idempotencyKey: string,
    tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  ) {
    const closedAt = new Date();
    const closed = await this.shiftRepository.updateShift(
      context,
      shift.id,
      {
        status: "closed",
        closedByUserId: context.userId,
        closedAt,
        notes: input.notes ?? shift.notes,
        closingSummary: { source: "pos", closedAt: closedAt.toISOString() },
        closeIdempotencyKey: idempotencyKey,
        version: shift.version + 1,
      },
      shift.version,
      tx,
    );
    if (!closed) throw new ConflictException("Shift was closed concurrently");
    await tx
      .update(tableWaiterAssignments)
      .set({
        endedAt: closedAt,
        endedByUserId: context.userId ?? null,
        reason: "turno encerrado",
        updatedAt: closedAt,
      })
      .where(
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.shiftId, shift.id),
          isNull(tableWaiterAssignments.endedAt),
        ),
      );
    await tx
      .update(approvalRequests)
      .set({ status: "expired", updatedAt: closedAt })
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.branchId, input.branchId),
          eq(approvalRequests.action, "waiter_table_help"),
          inArray(approvalRequests.status, ["pending", "approved"]),
          isNull(approvalRequests.appliedAt),
        ),
      );
    await this.posRepository.insertAuditLog(
      context,
      {
        branchId: input.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "shift.closed",
        entityType: "operational_shift",
        entityId: shift.id,
        metadata: { notes: input.notes ?? null },
      },
      tx,
    );
    return { ...closed, audit: "shift.closed", replayed: false };
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
