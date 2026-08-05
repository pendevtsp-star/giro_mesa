import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import type { PosRepository } from "./pos.repository";
import type { ShiftRepository } from "./shift.repository";
import { ShiftService } from "./shift.service";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = "11111111-1111-4111-8111-111111111111";
const foreignBranchId = "22222222-2222-4222-8222-222222222222";
const context = {
  tenantId,
  branchId,
  userId: "33333333-3333-4333-8333-333333333333",
  requestId: "shift-guard-test",
  permissions: ["cash:manage"],
};

function queryResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
    })),
  };
}

function serviceForQueryResults(
  results: unknown[][],
  staffFinance?: { assertCanCloseShift: ReturnType<typeof vi.fn> },
) {
  const queue = [...results];
  const tx = { select: vi.fn(() => queryResult(queue.shift() ?? [])) };
  const database = {
    db: { transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) },
  } as unknown as DatabaseService;
  const shift = {
    id: "44444444-4444-4444-8444-444444444444",
    branchId,
    openedAt: new Date("2026-08-03T10:00:00.000Z"),
    status: "open",
    notes: null,
    version: 1,
  };
  const shiftRepository = {
    findShiftByCloseKey: vi.fn(async () => null),
    findCurrentShiftForUpdate: vi.fn(async () => shift),
    findOpenCashSession: vi.fn(async () => null),
    updateShift: vi.fn(),
  } as unknown as ShiftRepository;
  const posRepository = {
    ensureBranchBelongsToTenant: vi.fn(async () => undefined),
    insertAuditLog: vi.fn(),
  } as unknown as PosRepository;
  return {
    service: new ShiftService(shiftRepository, posRepository, database, staffFinance as never),
    shiftRepository,
    tx,
  };
}

describe("shift Dose Club outbox gate", () => {
  it("runs the staff-finance participant gate in the same transaction", async () => {
    const staffFinance = {
      assertCanCloseShift: vi
        .fn()
        .mockRejectedValue(new BadRequestException("fechamento pendente")),
    };
    const { service, shiftRepository, tx } = serviceForQueryResults([], staffFinance);
    await expect(
      service.closeShift(context, { branchId, idempotencyKey: "close-staff-gate" }),
    ).rejects.toThrow("fechamento pendente");
    expect(staffFinance.assertCanCloseShift).toHaveBeenCalledWith(
      context,
      "44444444-4444-4444-8444-444444444444",
      tx,
    );
    expect(shiftRepository.updateShift).not.toHaveBeenCalled();
  });
  it("blocks close for an active legacy account pointing outside the tenant", async () => {
    const { service, shiftRepository } = serviceForQueryResults([
      [],
      [],
      [{ id: "integration-a", config: { branchId: foreignBranchId } }],
      [],
    ]);

    await expect(
      service.closeShift(context, { branchId, idempotencyKey: "close-invalid-branch" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(shiftRepository.updateShift).not.toHaveBeenCalled();
  });

  it("does not let a pending event escape for the exact tenant-owned branch", async () => {
    const { service, shiftRepository } = serviceForQueryResults([
      [],
      [],
      [{ id: "integration-a", config: { branchId } }],
      [{ id: branchId }],
      [{ id: "pending-outbox-event" }],
    ]);

    await expect(
      service.closeShift(context, { branchId, idempotencyKey: "close-pending-event" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(shiftRepository.updateShift).not.toHaveBeenCalled();
  });
});
