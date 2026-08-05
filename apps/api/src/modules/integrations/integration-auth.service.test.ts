import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { IntegrationAuthService } from "./integration-auth.service";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = "11111111-1111-4111-8111-111111111111";

function queryResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
    })),
  };
}

function serviceWithOwnedBranches(ownedBranches: Array<{ id: string }>) {
  const account = {
    tenantId,
    config: { branchId, scopes: ["products:read"] },
  };
  const select = vi
    .fn()
    .mockReturnValueOnce(queryResult([account]))
    .mockReturnValueOnce(queryResult(ownedBranches));
  return new IntegrationAuthService({ db: { select } } as unknown as DatabaseService);
}

describe("Dose Club integration authentication branch ownership", () => {
  it("rejects a nonexistent configured branch", async () => {
    await expect(
      serviceWithOwnedBranches([]).resolveContext(
        { "x-giromesa-integration-key": "club_whisky_test_key" },
        "club_whisky",
        "products:read",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a branch that is not returned from the account tenant scope", async () => {
    await expect(
      serviceWithOwnedBranches([]).resolveContext(
        { "x-giromesa-integration-key": "club_whisky_cross_tenant_key" },
        "club_whisky",
        "products:read",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("binds a valid integration context to its owned branch", async () => {
    await expect(
      serviceWithOwnedBranches([{ id: branchId }]).resolveContext(
        { "x-giromesa-integration-key": "club_whisky_valid_key" },
        "club_whisky",
        "products:read",
      ),
    ).resolves.toEqual(expect.objectContaining({ tenantId, branchId }));
  });
});
