import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { ReportsController } from "./reports.controller";
import type { ReportsService } from "./reports.service";

function controllerWithContext(permissions: string[]) {
  const branchId = "11111111-1111-4111-8111-111111111111";
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-test",
      branchId,
      userId: "user-test",
      requestId: "reports-test",
      permissions,
    })),
  } as unknown as AuthService;

  const reportsService = {
    financialReport: vi.fn(async (_context, input) => input),
  } as unknown as ReportsService;

  return {
    controller: new ReportsController(authService, reportsService),
    reportsService,
  };
}

describe("ReportsController", () => {
  it("requires reports:read permission", async () => {
    const { controller } = controllerWithContext(["tenant:manage"]);

    await expect(controller.financial({}, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("parses financial filters and forwards them to the service", async () => {
    const { controller, reportsService } = controllerWithContext(["reports:read"]);
    const branchId = "11111111-1111-4111-8111-111111111111";
    const cashSessionId = "22222222-2222-4222-8222-222222222222";

    await controller.financial(
      {},
      {
        branchId,
        period: "custom",
        dateFrom: "2026-07-07T00:00:00.000Z",
        dateTo: "2026-07-08T00:00:00.000Z",
        cashSessionId,
        paymentMethod: "cash",
        variance: "balanced",
        cashSessionStatus: "closed",
      },
    );

    expect(reportsService.financialReport).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      expect.objectContaining({
        branchId,
        period: "custom",
        cashSessionId,
        paymentMethod: "cash",
        variance: "balanced",
        cashSessionStatus: "closed",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      }),
    );
  });
});
