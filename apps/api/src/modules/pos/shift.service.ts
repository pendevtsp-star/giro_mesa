import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PosRepository } from "./pos.repository";
import { ShiftRepository } from "./shift.repository";

type OpenShiftInput = {
  branchId: string;
  notes?: string | undefined;
};

type CloseShiftInput = {
  branchId: string;
  notes?: string | undefined;
};

@Injectable()
export class ShiftService {
  constructor(
    @Inject(ShiftRepository) private readonly shiftRepository: ShiftRepository,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
  ) {}

  async getCurrentShift(context: TenantContext, branchId: string) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const shift = await this.shiftRepository.findCurrentShift(context, branchId);
    return { branchId, shift: shift ?? null };
  }

  async openShift(context: TenantContext, input: OpenShiftInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const existing = await this.shiftRepository.findCurrentShift(context, input.branchId);
    if (existing) {
      throw new ConflictException("There is already an open shift for this branch");
    }

    const shift = await this.shiftRepository.insertShift(context, {
      branchId: input.branchId,
      openedByUserId: context.userId ?? "",
      notes: input.notes ?? null,
      openingContext: { source: "pos" },
    });

    if (!shift) {
      throw new BadRequestException("Unable to open shift");
    }

    await this.posRepository.insertAuditLog(context, {
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "shift.opened",
      entityType: "operational_shift",
      entityId: shift.id,
      metadata: { notes: input.notes ?? null },
    });

    return { ...shift, audit: "shift.opened" };
  }

  async closeShift(context: TenantContext, input: CloseShiftInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const shift = await this.shiftRepository.findCurrentShift(context, input.branchId);
    if (!shift) {
      throw new NotFoundException("Open shift not found");
    }

    const openCash = await this.shiftRepository.findOpenCashSession(context, input.branchId);
    if (openCash) {
      throw new BadRequestException("Close the cash session before closing the shift");
    }

    const closed = await this.shiftRepository.updateShift(context, shift.id, {
      status: "closed",
      closedByUserId: context.userId,
      closedAt: new Date(),
      notes: input.notes ?? shift.notes,
      closingSummary: { source: "pos", closedAt: new Date().toISOString() },
    });

    await this.posRepository.insertAuditLog(context, {
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "shift.closed",
      entityType: "operational_shift",
      entityId: shift.id,
      metadata: { notes: input.notes ?? null },
    });

    return { ...closed, audit: "shift.closed" };
  }
}
