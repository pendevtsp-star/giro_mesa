import { describe, expect, it, vi } from "vitest";
import { RateLimitService } from "../../common/rate-limit";
import { CatalogController } from "./catalog.controller";

function createController() {
  const context = {
    tenantId: "tenant-1",
    branchId: "branch-1",
    userId: "user-1",
    requestId: "catalog-test",
    permissions: ["catalog:manage"],
  };
  const catalogService = {
    updateProduct: vi.fn(async (_context, productId, input) => ({ id: productId, ...input })),
  };
  const authService = { resolveContext: vi.fn(async () => context) };
  return {
    controller: new CatalogController(
      catalogService as never,
      authService as never,
      new RateLimitService(),
    ),
    catalogService,
    context,
  };
}

describe("CatalogController product classification", () => {
  it("allows an administrator to explicitly correct the alcoholic marker", async () => {
    const { controller, catalogService, context } = createController();

    await controller.updateProduct(
      "product-1",
      { isAlcoholic: true },
      { authorization: "Bearer test" },
    );

    expect(catalogService.updateProduct).toHaveBeenCalledWith(context, "product-1", {
      isAlcoholic: true,
    });
  });

  it("rejects ambiguous non-boolean alcoholic classifications", async () => {
    const { controller, catalogService } = createController();

    await expect(
      controller.updateProduct(
        "product-1",
        { isAlcoholic: "yes" },
        { authorization: "Bearer test" },
      ),
    ).rejects.toThrow();
    expect(catalogService.updateProduct).not.toHaveBeenCalled();
  });
});
