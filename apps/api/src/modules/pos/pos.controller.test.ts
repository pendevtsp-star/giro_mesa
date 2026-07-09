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
});
