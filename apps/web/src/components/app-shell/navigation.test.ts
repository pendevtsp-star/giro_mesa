import { describe, expect, it } from "vitest";
import {
  type AppNavigationItem,
  canAccessAppPath,
  filterNavigationByPermissions,
  groupNavigationItems,
  isNavigationItemActive,
} from "./navigation";

function requireItem(item: AppNavigationItem | undefined) {
  if (!item) {
    throw new Error("Expected navigation item to exist");
  }
  return item;
}

describe("app shell navigation", () => {
  it("keeps dashboard public and filters operational items by permission", () => {
    const visible = filterNavigationByPermissions(["pos:operate"]).map((item) => item.labelKey);

    expect(visible).toContain("nav.dashboard");
    expect(visible).toContain("nav.pos");
    expect(visible).toContain("nav.salon");
    expect(visible).toContain("nav.customers");
    expect(visible).not.toContain("nav.inventory");
    expect(visible).not.toContain("nav.backoffice");
  });

  it("groups visible items for scannable navigation", () => {
    const groups = groupNavigationItems(filterNavigationByPermissions(["tenant:manage"]));

    expect(groups.map((group) => group.group)).toEqual(["operation", "settings", "ecosystem"]);
    const settingsItems =
      groups.find((group) => group.group === "settings")?.items.map((item) => item.labelKey) ?? [];
    expect(settingsItems).toContain("nav.onboarding");
    expect(settingsItems).toContain("nav.branding");
    expect(settingsItems).toContain("nav.security");
    expect(settingsItems).toContain("nav.team");
    const ecosystemItems =
      groups.find((group) => group.group === "ecosystem")?.items.map((item) => item.labelKey) ?? [];
    expect(ecosystemItems).toEqual(["nav.billing", "nav.doseClub"]);
  });

  it("marks dashboard, POS and nested routes without false positives", () => {
    const dashboard = requireItem(filterNavigationByPermissions([])[0]);
    const pos = requireItem(
      filterNavigationByPermissions(["pos:operate"]).find((item) => item.labelKey === "nav.pos"),
    );
    const reports = requireItem(
      filterNavigationByPermissions(["reports:read"]).find(
        (item) => item.labelKey === "nav.reports",
      ),
    );

    expect(isNavigationItemActive(dashboard, "/app")).toBe(true);
    expect(isNavigationItemActive(dashboard, "/app/reports")).toBe(false);
    expect(isNavigationItemActive(pos, "/app/pos")).toBe(true);
    expect(isNavigationItemActive(reports, "/app/reports/detail")).toBe(true);
  });

  it("does not expose administrative production or catalog screens to waiters", () => {
    const visible = filterNavigationByPermissions([
      "pos:operate",
      "pos:kds_send",
      "pos:qr_review",
    ]).map((item) => item.labelKey);

    expect(visible).toContain("nav.waiter");
    expect(visible).not.toContain("nav.kds");
    expect(visible).not.toContain("nav.catalog");
    expect(canAccessAppPath("/app/kds", ["pos:kds_send"])).toBe(false);
    expect(canAccessAppPath("/app/catalog", ["pos:qr_review"])).toBe(false);
  });

  it("uses the same permission decision for direct and nested routes", () => {
    expect(canAccessAppPath("/app/cash", ["cash:manage"])).toBe(true);
    expect(canAccessAppPath("/app/inventory/purchases", ["inventory:manage"])).toBe(true);
    expect(canAccessAppPath("/app/integrations/dose-club", ["tenant:manage"])).toBe(true);
    expect(canAccessAppPath("/app/pos", ["kds:operate"])).toBe(false);
    expect(canAccessAppPath("/app/unknown", ["tenant:manage"])).toBe(false);
  });

  it("keeps delivery in the operation group and commercial links in the ecosystem group", () => {
    const groups = groupNavigationItems(
      filterNavigationByPermissions(["delivery:manage", "tenant:manage"]),
    );
    expect(
      groups.find((group) => group.group === "operation")?.items.map((item) => item.href),
    ).toContain("/app/delivery");
    expect(
      groups.find((group) => group.group === "ecosystem")?.items.map((item) => item.href),
    ).toEqual(["/app/billing", "/app/integrations/dose-club"]);
  });
});
