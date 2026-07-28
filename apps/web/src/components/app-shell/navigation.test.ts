import { describe, expect, it } from "vitest";
import {
  type AppNavigationItem,
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

    expect(groups.map((group) => group.group)).toEqual(["operation", "settings"]);
    const settingsItems =
      groups.find((group) => group.group === "settings")?.items.map((item) => item.labelKey) ?? [];
    expect(settingsItems).toContain("nav.onboarding");
    expect(settingsItems).toContain("nav.billing");
    expect(settingsItems).toContain("nav.branding");
    expect(settingsItems).toContain("nav.security");
    expect(settingsItems).toContain("nav.team");
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
});
