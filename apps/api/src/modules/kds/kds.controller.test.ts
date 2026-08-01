import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { KdsController } from "./kds.controller";
import type { KdsService } from "./kds.service";

function controllerWithPermissions(permissions: string[]) {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-test",
      branchId: "branch-test",
      userId: "user-test",
      requestId: "kds-test",
      permissions,
    })),
  } as unknown as AuthService;
  const kdsService = {
    listTickets: vi.fn(async () => []),
    updateTicketItem: vi.fn(async (_context, ticketId, itemId, status) => ({
      id: ticketId,
      itemId,
      status,
      audit: "kds.item_updated",
    })),
  } as unknown as KdsService;

  return {
    controller: new KdsController(kdsService, authService),
    kdsService,
  };
}

describe("KdsController permissions", () => {
  it("denies POS and KDS-send roles without kitchen operation permission", async () => {
    for (const permissions of [["pos:operate"], ["pos:kds_send"]]) {
      const { controller, kdsService } = controllerWithPermissions(permissions);

      await expect(controller.listTickets({})).rejects.toBeInstanceOf(ForbiddenException);
      expect(kdsService.listTickets).not.toHaveBeenCalled();
    }
  });

  it("allows a kitchen operator to list tickets", async () => {
    const { controller, kdsService } = controllerWithPermissions(["kds:operate"]);

    await expect(controller.listTickets({})).resolves.toEqual({ data: [] });
    expect(kdsService.listTickets).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
    );
  });

  it("updates an individual item without requiring a whole ticket transition", async () => {
    const { controller, kdsService } = controllerWithPermissions(["kds:operate"]);

    await expect(
      controller.updateTicketItem("ticket-1", "item-1", { status: "ready" }, {}),
    ).resolves.toMatchObject({ audit: "kds.item_updated", status: "ready" });
    expect(kdsService.updateTicketItem).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "ticket-1",
      "item-1",
      "ready",
    );
  });
});
