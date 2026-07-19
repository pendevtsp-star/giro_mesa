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
    const visible = filterNavigationByPermissions(["pos:operate"]).map((item) => item.label);

    expect(visible).toContain("Dashboard");
    expect(visible).toContain("PDV");
    expect(visible).toContain("Salão");
    expect(visible).toContain("Clientes");
    expect(visible).not.toContain("Estoque");
    expect(visible).not.toContain("Backoffice");
  });

  it("groups visible items for scannable navigation", () => {
    const groups = groupNavigationItems(filterNavigationByPermissions(["tenant:manage"]));

    expect(groups.map((group) => group.group)).toEqual(["Operação", "Configuração"]);
    expect(
      groups.find((group) => group.group === "Configuração")?.items.map((item) => item.label),
    ).toEqual(["Implantação", "Personalização", "Segurança", "Equipe"]);
  });

  it("marks dashboard, POS and nested routes without false positives", () => {
    const dashboard = requireItem(filterNavigationByPermissions([])[0]);
    const pos = requireItem(
      filterNavigationByPermissions(["pos:operate"]).find((item) => item.label === "PDV"),
    );
    const reports = requireItem(
      filterNavigationByPermissions(["reports:read"]).find((item) => item.label === "Relatórios"),
    );

    expect(isNavigationItemActive(dashboard, "/app")).toBe(true);
    expect(isNavigationItemActive(dashboard, "/app/reports")).toBe(false);
    expect(isNavigationItemActive(pos, "/app?view=pos")).toBe(true);
    expect(isNavigationItemActive(reports, "/app/reports/detail")).toBe(true);
  });
});
