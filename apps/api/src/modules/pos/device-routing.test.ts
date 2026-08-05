import { describe, expect, it } from "vitest";
import { isProductionRouteCompatible } from "./device-routing";

const scope = { tenantId: "tenant-a", branchId: "branch-a", stationCategoryIds: ["food"] };
const route = {
  tenantId: "tenant-a",
  branchId: "branch-a",
  trigger: "kds_ticket_created",
  targetType: "kitchen_ticket",
  productCategoryIds: ["food"],
};

describe("production device routing", () => {
  it("rejects disjoint categories and non-production routes", () => {
    expect(isProductionRouteCompatible(scope, { ...route, productCategoryIds: ["drinks"] })).toBe(
      false,
    );
    expect(isProductionRouteCompatible(scope, { ...route, targetType: "payment_receipt" })).toBe(
      false,
    );
  });

  it("rejects cross-tenant and cross-branch routes", () => {
    expect(isProductionRouteCompatible(scope, { ...route, tenantId: "tenant-b" })).toBe(false);
    expect(isProductionRouteCompatible(scope, { ...route, branchId: "branch-b" })).toBe(false);
  });

  it("accepts complete or explicit global category coverage", () => {
    expect(isProductionRouteCompatible(scope, route)).toBe(true);
    expect(isProductionRouteCompatible(scope, { ...route, productCategoryIds: [] })).toBe(true);
  });
});
