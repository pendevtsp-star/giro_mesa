import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { PlatformController } from "./platform.controller";
import type { PlatformService } from "./platform.service";

function controllerWithContext(permissions: string[]) {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "platform",
      userId: "platform-user",
      requestId: "platform-test",
      permissions,
    })),
  } as unknown as AuthService;

  const platformService = {
    listTenants: vi.fn(async () => []),
    getCommercialSummary: vi.fn(async () => ({
      overview: {
        totalTenants: 3,
        active: 1,
        trials: 1,
        pastDue: 1,
        suspended: 0,
        risks: 2,
        supportQueue: 1,
        trialEnding: 1,
        followUpsDue: 1,
        overdueFollowUps: 1,
        trialsWithoutOwner: 1,
        staleTrials7d: 1,
        highTouchAccounts: 1,
        mrrActiveCents: 29900,
        pastDueMrrCents: 29900,
        communicationsLast7Days: 2,
      },
      pipeline: {
        active: 1,
        trial: 1,
        pastDue: 1,
        onboardingRisk: 1,
      },
      support: {
        openCount: 1,
        highPriorityCount: 1,
        countsByStatus: {
          queued: 1,
          inProgress: 0,
          waitingCustomer: 0,
          resolved: 0,
        },
        items: [],
      },
      agenda: {
        countsByAlertType: {
          pastDue: 1,
          trialEnding: 0,
          highPriority: 0,
          followUp: 0,
        },
        items: [],
      },
      watchlist: {
        overdueFollowUpsCount: 1,
        trialsWithoutOwnerCount: 1,
        staleTrials7dCount: 1,
      },
      communications: {
        recent: [],
        countsByType: {
          trialEnding: 0,
          pastDue: 0,
          supportFollowUp: 0,
        },
      },
    })),
    listCommunications: vi.fn(async () => []),
    createTenant: vi.fn(async () => ({
      tenant: { id: "tenant-id", name: "Novo Bar", slug: "novo-bar", status: "trial" },
    })),
    updateTenantStatus: vi.fn(async () => ({
      id: "tenant-id",
      name: "Novo Bar",
      slug: "novo-bar",
      status: "active",
    })),
    updateTenantSupport: vi.fn(async () => ({
      tenantId: "tenant-id",
      support: {
        priority: "high",
        commercialNotes: "Cliente pediu retorno amanha.",
      },
    })),
    sendTenantCommunication: vi.fn(async () => ({
      tenantId: "tenant-id",
      type: "trial_ending",
      recipientEmail: "admin@tenant.local",
      provider: "mock",
      queued: true,
    })),
  } as unknown as PlatformService;

  return {
    controller: new PlatformController(authService, platformService),
    platformService,
  };
}

describe("PlatformController", () => {
  it("requires platform:manage permission", async () => {
    const { controller } = controllerWithContext(["tenant:manage"]);

    await expect(controller.listTenants({})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists global communications through the protected platform endpoint", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    await controller.listCommunications({}, { type: "past_due", limit: "15" });

    expect(platformService.listCommunications).toHaveBeenCalledWith({
      type: "past_due",
      limit: 15,
    });
  });

  it("returns the protected commercial summary", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    const result = await controller.summary({});

    expect(platformService.getCommercialSummary).toHaveBeenCalled();
    expect(result.overview.mrrActiveCents).toBe(29900);
  });

  it("creates tenants through the protected platform endpoint", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    const result = await controller.createTenant(
      {
        name: "Novo Bar",
        ownerName: "Dono",
        ownerEmail: "dono@novobar.local",
        planCode: "professional",
      },
      {},
    );

    expect(result.tenant.name).toBe("Novo Bar");
    expect(platformService.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "platform" }),
      expect.objectContaining({ name: "Novo Bar", branchName: "Matriz" }),
    );
  });

  it("rejects tenant_id overrides from platform requests", async () => {
    const { controller } = controllerWithContext(["platform:manage"]);

    await expect(
      controller.createTenant(
        {
          name: "Novo Bar",
          ownerName: "Dono",
          ownerEmail: "dono@novobar.local",
          planCode: "professional",
          tenant_id: "malicious",
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates tenant status with platform permission", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    await controller.updateTenantStatus("tenant-id", { status: "active" }, {});

    expect(platformService.updateTenantStatus).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["platform:manage"] }),
      "tenant-id",
      "active",
    );
  });

  it("persists support notes through the protected platform endpoint", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    await controller.updateTenantSupport(
      "tenant-id",
      {
        priority: "high",
        commercialNotes: "Cliente pediu retorno amanha.",
      },
      {},
    );

    expect(platformService.updateTenantSupport).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["platform:manage"] }),
      "tenant-id",
      {
        priority: "high",
        commercialNotes: "Cliente pediu retorno amanha.",
        slaTier: "standard",
        supportStatus: "queued",
      },
    );
  });

  it("sends customer communication through the protected platform endpoint", async () => {
    const { controller, platformService } = controllerWithContext(["platform:manage"]);

    await controller.sendTenantCommunication("tenant-id", { type: "trial_ending" }, {});

    expect(platformService.sendTenantCommunication).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["platform:manage"] }),
      "tenant-id",
      "trial_ending",
    );
  });
});
