type ProductionRoute = {
  tenantId: string;
  branchId: string;
  trigger: string;
  targetType: string;
  productCategoryIds: string[];
};

export function isProductionRouteCompatible(
  scope: { tenantId: string; branchId: string; stationCategoryIds: string[] },
  route: ProductionRoute,
) {
  if (route.tenantId !== scope.tenantId || route.branchId !== scope.branchId) return false;
  if (route.trigger !== "kds_ticket_created") return false;
  if (!new Set(["kitchen_ticket", "bar_ticket"]).has(route.targetType)) return false;
  if (route.productCategoryIds.length === 0) return true;
  const covered = new Set(route.productCategoryIds);
  return scope.stationCategoryIds.every((categoryId) => covered.has(categoryId));
}
