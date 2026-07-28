import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { InventoryController } from "./inventory.controller";
import type { InventoryService } from "./inventory.service";

function controllerWithPermissions(permissions: string[]) {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-test",
      branchId: "branch-test",
      userId: "user-test",
      requestId: "inventory-test",
      permissions,
    })),
  } as unknown as AuthService;
  const inventoryService = {
    listSummary: vi.fn(async () => []),
    createItem: vi.fn(async () => ({ id: "item-test" })),
  } as unknown as InventoryService;

  return {
    controller: new InventoryController(inventoryService, authService),
    inventoryService,
  };
}

describe("InventoryController permissions", () => {
  it("denies POS operators without inventory management permission", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["pos:operate"]);

    await expect(controller.listSummary({}, "branch-test")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(inventoryService.listSummary).not.toHaveBeenCalled();
  });

  it("allows inventory managers to read the scoped summary", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);

    await expect(controller.listSummary({}, "branch-test")).resolves.toEqual({ data: [] });
    expect(inventoryService.listSummary).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "branch-test",
    );
  });

  it("rejects tenant override attempts before creating an inventory item", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);

    await expect(
      controller.createItem(
        {},
        {
          name: "Gin",
          unit: "ml",
          tenantId: "tenant-other",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventoryService.createItem).not.toHaveBeenCalled();
  });
});
