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

  it("scopes transfer creation to the authenticated tenant and rejects tenant overrides", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);
    inventoryService.createTransfer = vi.fn(async () => ({
      id: "transfer-test",
    })) as unknown as InventoryService["createTransfer"];
    const body = {
      branchId: "00000000-0000-4000-8000-000000000001",
      originLocationId: "00000000-0000-4000-8000-000000000002",
      destinationLocationId: "00000000-0000-4000-8000-000000000003",
      reason: "Reposição do bar principal",
      idempotencyKey: "transfer-test-key",
      lines: [{ inventoryItemId: "00000000-0000-4000-8000-000000000004", quantity: "2" }],
    };

    await expect(controller.createTransfer({}, body)).resolves.toEqual({ id: "transfer-test" });
    expect(inventoryService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      body,
    );
    await expect(
      controller.createTransfer({}, { ...body, tenantId: "tenant-other" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts zero received quantity for a fully divergent transfer line", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);
    inventoryService.receiveTransfer = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000010",
    })) as unknown as InventoryService["receiveTransfer"];

    await controller.receiveTransfer({}, "00000000-0000-4000-8000-000000000010", {
      expectedVersion: 2,
      lines: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          quantityReceived: "0",
          divergenceReason: "Carga integral extraviada",
        },
      ],
    });

    expect(inventoryService.receiveTransfer).toHaveBeenCalled();
  });

  it("requires a supplier for returnable exchange", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);
    inventoryService.recordReturnableEvent =
      vi.fn() as unknown as InventoryService["recordReturnableEvent"];

    await expect(
      controller.recordReturnableEvent(
        {},
        {
          branchId: "00000000-0000-4000-8000-000000000001",
          stockLocationId: "00000000-0000-4000-8000-000000000002",
          mappingId: "00000000-0000-4000-8000-000000000003",
          quantity: "2",
          type: "supplier_exchange",
          reason: "Troca semanal",
          idempotencyKey: "returnable-test",
        },
      ),
    ).rejects.toThrow("Fornecedor é obrigatório");
    expect(inventoryService.recordReturnableEvent).not.toHaveBeenCalled();
  });

  it("requires a registered mapping instead of an arbitrary full and empty pair", async () => {
    const { controller, inventoryService } = controllerWithPermissions(["inventory:manage"]);
    inventoryService.recordReturnableEvent =
      vi.fn() as unknown as InventoryService["recordReturnableEvent"];

    await expect(
      controller.recordReturnableEvent(
        {},
        {
          branchId: "00000000-0000-4000-8000-000000000001",
          stockLocationId: "00000000-0000-4000-8000-000000000002",
          fullInventoryItemId: "00000000-0000-4000-8000-000000000003",
          emptyInventoryItemId: "00000000-0000-4000-8000-000000000004",
          supplierId: "00000000-0000-4000-8000-000000000005",
          quantity: "2",
          type: "supplier_exchange",
          reason: "Troca semanal",
          idempotencyKey: "returnable-test",
        },
      ),
    ).rejects.toThrow();
    expect(inventoryService.recordReturnableEvent).not.toHaveBeenCalled();
  });
});
