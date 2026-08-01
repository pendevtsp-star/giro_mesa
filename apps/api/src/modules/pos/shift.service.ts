import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
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
      const openCash = await this.shiftRepository.findOpenCashSession(context, input.branchId, tx);
      if (openCash)
        throw new BadRequestException("Close the cash session before closing the shift");
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
    });
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
