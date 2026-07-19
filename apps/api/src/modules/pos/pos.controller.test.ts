import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { PosController } from "./pos.controller";
import type { PosService } from "./pos.service";

function controllerWithContext(permissions: string[]) {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-test",
      branchId: "11111111-1111-4111-8111-111111111111",
      userId: "user-test",
      requestId: "pos-test",
      permissions,
    })),
  } as unknown as AuthService;

  const posService = {
    registerPayment: vi.fn(async (_context, _orderId, input) => ({
      id: "payment-id",
      amountCents: input.amountCents,
      method: input.method,
      orderStatus: "partially_paid",
      audit: "payment.confirmed",
    })),
    listOrderPayments: vi.fn(async () => [
      {
        id: "payment-id",
        amountCents: 2500,
        method: "cash",
        status: "confirmed",
        confirmedAt: new Date("2026-07-09T00:00:00.000Z"),
        createdAt: new Date("2026-07-09T00:00:00.000Z"),
        audit: "payment.confirmed",
      },
    ]),
    closeCashSession: vi.fn(async (_context, sessionId, input) => ({
      id: sessionId,
      status: "closed",
      countedAmountCents: input.countedAmountCents,
      differenceCents: 0,
      audit: "cash_session.closed",
    })),
    openShift: vi.fn(async (_context, input) => ({
      id: "shift-id",
      branchId: input.branchId,
      status: "open",
      audit: "shift.opened",
    })),
    closeShift: vi.fn(async (_context, input) => ({
      id: "shift-id",
      branchId: input.branchId,
      status: "closed",
      audit: "shift.closed",
    })),
    registerCashMovement: vi.fn(async (_context, type, input) => ({
      id: "movement-id",
      type,
      amountCents: input.amountCents,
      reason: input.reason,
      audit: "cash_movement.created",
    })),
  } as unknown as PosService;

  return {
    controller: new PosController(posService, authService),
    posService,
  };
}

describe("PosController", () => {
  it("requires at least POS-compatible permission to list order payments", async () => {
    const { controller } = controllerWithContext(["reports:read"]);

    await expect(controller.listOrderPayments("order-1", {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("lists order payments with payment permission", async () => {
    const { controller, posService } = controllerWithContext(["pos:payment_manage"]);

    const result = await controller.listOrderPayments("order-1", {});

    expect(posService.listOrderPayments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "order-1",
    );
    expect(result.data).toHaveLength(1);
  });

  it("registers partial or mixed payments through the protected endpoint", async () => {
    const { controller, posService } = controllerWithContext(["pos:payment_manage"]);

    const result = await controller.registerPayment(
      "order-1",
      {
        amountCents: 2500,
        method: "cash",
        idempotencyKey: "payment-key-123",
      },
      {},
    );

    expect(posService.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "order-1",
      expect.objectContaining({ amountCents: 2500, method: "cash" }),
    );
    expect(result.orderStatus).toBe("partially_paid");
  });

  it("rejects tenant overrides in payment payloads", async () => {
    const { controller } = controllerWithContext(["pos:payment_manage"]);

    await expect(
      controller.registerPayment(
        "order-1",
        {
          amountCents: 2500,
          method: "cash",
          idempotencyKey: "payment-key-123",
          tenant_id: "malicious",
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("closes cash session through cash:manage endpoint", async () => {
    const { controller, posService } = controllerWithContext(["cash:manage"]);

    const result = await controller.closeCashSession(
      "session-1",
      { countedAmountCents: 12000 },
      {},
    );

    expect(posService.closeCashSession).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "session-1",
      { countedAmountCents: 12000 },
    );
    expect(result.audit).toBe("cash_session.closed");
  });

  it("opens a shift through the protected endpoint", async () => {
    const { controller, posService } = controllerWithContext(["pos:operate"]);

    const result = await controller.openShift(
      { branchId: "11111111-1111-4111-8111-111111111111" },
      {},
    );

    expect(posService.openShift).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      expect.objectContaining({ branchId: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(result.audit).toBe("shift.opened");
  });

  it("requires cash permission to close shift", async () => {
    const { controller } = controllerWithContext(["pos:operate"]);

    await expect(
      controller.closeShift({ branchId: "11111111-1111-4111-8111-111111111111" }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects tenant overrides in cash movement payloads", async () => {
    const { controller } = controllerWithContext(["cash:manage"]);

    await expect(
      controller.supplyCash(
        {
          branchId: "11111111-1111-4111-8111-111111111111",
          amountCents: 5000,
          reason: "Troco inicial",
          tenantId: "evil",
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("registers cash withdrawal through cash:manage endpoint", async () => {
    const { controller, posService } = controllerWithContext(["cash:manage"]);

    const result = await controller.withdrawCash(
      {
        branchId: "11111111-1111-4111-8111-111111111111",
        amountCents: 3000,
        reason: "Retirada para cofre",
      },
      {},
    );

    expect(posService.registerCashMovement).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "withdrawal",
      expect.objectContaining({ amountCents: 3000 }),
    );
    expect(result.audit).toBe("cash_movement.created");
  });
});
