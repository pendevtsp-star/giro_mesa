import { describe, expect, it } from "vitest";
import { buildPendingActions, type PendingCenterInput } from "./DashboardOverview";

function baseInput(overrides: Partial<PendingCenterInput> = {}): PendingCenterInput {
  return {
    onboardingStatus: null,
    currentShift: null,
    cashSummary: null,
    inventoryAlerts: [],
    qrPendingOrders: [],
    tickets: [],
    canManageTenant: false,
    canManageCash: false,
    canManageInventory: false,
    canOperatePos: false,
    canOperateKds: false,
    ...overrides,
  };
}

describe("dashboard pending center", () => {
  it("shows only actions allowed by the operator profile", () => {
    const actions = buildPendingActions(
      baseInput({
        canOperatePos: true,
        canOperateKds: true,
        qrPendingOrders: [{} as PendingCenterInput["qrPendingOrders"][number]],
        tickets: [{ status: "preparing" } as PendingCenterInput["tickets"][number]],
        canManageTenant: true,
        onboardingStatus: {
          readiness: "blocked",
          blockers: [{} as never],
        } as unknown as PendingCenterInput["onboardingStatus"],
      }),
    );

    expect(actions.map((action) => action.id)).toEqual(["onboarding", "qr-orders", "kds"]);
    expect(actions.every((action) => action.owner !== "Caixa")).toBe(true);
  });

  it("does not report served tickets and exposes an empty state when nothing is pending", () => {
    const actions = buildPendingActions(
      baseInput({ canOperateKds: true, tickets: [{ status: "served" } as never] }),
    );

    expect(actions).toEqual([]);
  });
});
