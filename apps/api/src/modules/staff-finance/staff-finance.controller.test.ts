import { describe, expect, it, vi } from "vitest";
import { StaffFinanceController } from "./staff-finance.controller";

const context = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  permissions: ["staff_finance:manage"],
};
const headers = {};
const id = "00000000-0000-4000-8000-000000000003";

describe("StaffFinanceController", () => {
  it("returns waiter and managerial settlements in one canonical response", async () => {
    const auth = { resolveContext: vi.fn().mockResolvedValue(context) };
    const service = {
      listSettlements: vi.fn().mockResolvedValue([{ id: "waiter" }]),
      getManagerialSettlement: vi.fn().mockResolvedValue({ id: "manager" }),
    };
    const controller = new StaffFinanceController(auth as never, service as never);
    await expect(controller.settlements(headers, id)).resolves.toEqual({
      data: [{ id: "waiter" }],
      managerial: { id: "manager" },
    });
  });

  it("requires payload-aware idempotency to approve an accrual", async () => {
    const auth = { resolveContext: vi.fn().mockResolvedValue(context) };
    const service = { approveAccrual: vi.fn().mockResolvedValue({ status: "approved" }) };
    const controller = new StaffFinanceController(auth as never, service as never);
    await controller.approve(headers, id, { expectedVersion: 1, idempotencyKey: "idem-approval" });
    expect(service.approveAccrual).toHaveBeenCalledWith(context, id, 1, "idem-approval");
    await expect(controller.approve(headers, id, { expectedVersion: 1 })).rejects.toThrow();
  });

  it("serves CSV, print HTML and thermal reports with their real content types", async () => {
    const auth = { resolveContext: vi.fn().mockResolvedValue(context) };
    const service = {
      financialReportCsv: vi.fn().mockResolvedValue("csv"),
      financialReportPrintHtml: vi.fn().mockResolvedValue("<html>print</html>"),
      financialReportThermal: vi.fn().mockResolvedValue("thermal"),
    };
    const controller = new StaffFinanceController(auth as never, service as never);
    const reply = { header: vi.fn() };
    await expect(
      controller.financialReportCsv(headers, { branchId: id }, reply as never),
    ).resolves.toBe("csv");
    expect(reply.header).toHaveBeenCalledWith("content-type", "text/csv; charset=utf-8");
    await expect(
      controller.financialReportPrint(headers, { branchId: id }, reply as never),
    ).resolves.toBe("<html>print</html>");
    expect(reply.header).toHaveBeenCalledWith("content-type", "text/html; charset=utf-8");
    await expect(
      controller.financialReportThermal(headers, { branchId: id }, reply as never),
    ).resolves.toBe("thermal");
    expect(reply.header).toHaveBeenCalledWith("content-type", "text/plain; charset=utf-8");
  });
});
