import { describe, expect, it } from "vitest";
import {
  buildNextDashboardAction,
  buildPendingActions,
  buildProfileInsights,
  type PendingCenterInput,
  type ProfileDashboardInput,
} from "./DashboardOverview";

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

function profileInput(overrides: Partial<ProfileDashboardInput> = {}): ProfileDashboardInput {
  return {
    dashboardSummary: null,
    cashSummary: null,
    salesPeriodData: null,
    inventoryAlerts: [],
    qrPendingOrders: [],
    tickets: [],
    canManageTenant: false,
    canManageApprovals: false,
    canManageCash: false,
    canManageInventory: false,
    canOperatePos: false,
    canOperateKds: false,
    occupiedLabel: "0/0",
    financialReport: null,
    ...overrides,
  };
}

describe("dashboard pending center", () => {
  it("promotes the first real blocker as the executive next action", () => {
    const nextAction = buildNextDashboardAction(
      baseInput({ canManageCash: true, currentShift: null }),
    );

    expect(nextAction).toMatchObject({
      id: "shift",
      title: "Abrir o turno",
      href: "/app/cash",
    });
  });

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

describe("profile dashboard", () => {
  it("prioritizes the owner view when multiple permissions are present", () => {
    const insights = buildProfileInsights(
      profileInput({
        canManageTenant: true,
        canManageCash: true,
        canOperatePos: true,
        dashboardSummary: {
          salesToday: 12500,
          activeOrders: 3,
          occupiedTables: "2/8",
          cashBalance: 8900,
          cashOpen: true,
        },
        occupiedLabel: "2/8",
      }),
    );

    expect(insights.map((insight) => insight.id)).toEqual([
      "sales",
      "cash",
      "margin",
      "occupancy",
      "alerts",
      "production",
      "inventory",
    ]);
    expect(insights[0]?.value?.replace(/\u00a0/g, " ")).toBe("R$ 125,00");
    expect(insights[1]?.value?.replace(/\u00a0/g, " ")).toBe("R$ 89,00");
  });

  it("shows the manager operational queue without duplicating terminal tickets", () => {
    const insights = buildProfileInsights(
      profileInput({
        canManageApprovals: true,
        dashboardSummary: {
          salesToday: 0,
          activeOrders: 4,
          occupiedTables: "3/8",
          cashBalance: 0,
          cashOpen: false,
        },
        qrPendingOrders: [{} as ProfileDashboardInput["qrPendingOrders"][number]],
        inventoryAlerts: [{} as ProfileDashboardInput["inventoryAlerts"][number]],
        tickets: [
          { status: "preparing" } as ProfileDashboardInput["tickets"][number],
          { status: "served" } as ProfileDashboardInput["tickets"][number],
        ],
      }),
    );

    expect(insights.map((insight) => insight.id)).toEqual([
      "service",
      "qr",
      "production",
      "inventory",
    ]);
    expect(insights.find((insight) => insight.id === "production")?.value).toBe("1");
  });
});
