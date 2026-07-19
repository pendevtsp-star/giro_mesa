import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { OnboardingController } from "./onboarding.controller";
import type { OnboardingService } from "./onboarding.service";

function controllerWithContext(permissions: string[]) {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-test",
      branchId: "branch-test",
      userId: "user-test",
      requestId: "onboarding-test",
      permissions,
    })),
  } as unknown as AuthService;

  const onboardingService = {
    getStatus: vi.fn(async () => ({ readiness: "in_progress", progressPercent: 40 })),
    updateStep: vi.fn(async (_context, input) => ({
      readiness: "in_progress",
      progressPercent: 50,
      lastStep: input,
    })),
    recalculateReadiness: vi.fn(async () => ({ readiness: "ready", progressPercent: 100 })),
  } as unknown as OnboardingService;

  return {
    controller: new OnboardingController(onboardingService, authService),
    onboardingService,
  };
}

describe("OnboardingController", () => {
  it("allows POS operators to read onboarding status", async () => {
    const { controller, onboardingService } = controllerWithContext(["pos:operate"]);

    const result = await controller.status({}, "branch-test");

    expect(onboardingService.getStatus).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test" }),
      "branch-test",
    );
    expect(result.progressPercent).toBe(40);
  });

  it("requires tenant management to complete steps", async () => {
    const { controller } = controllerWithContext(["pos:operate"]);

    await expect(controller.completeStep({}, { stepKey: "catalog_setup" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects tenant override in step updates", async () => {
    const { controller } = controllerWithContext(["tenant:manage"]);

    await expect(
      controller.startStep({}, { stepKey: "catalog_setup", tenantId: "other" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates onboarding step with audit-capable context", async () => {
    const { controller, onboardingService } = controllerWithContext(["tenant:manage"]);

    const result = await controller.completeStep({}, { stepKey: "tables_setup" });

    expect(onboardingService.updateStep).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-test", requestId: "onboarding-test" }),
      expect.objectContaining({ stepKey: "tables_setup", status: "completed" }),
    );
    expect(result.progressPercent).toBe(50);
  });
});
