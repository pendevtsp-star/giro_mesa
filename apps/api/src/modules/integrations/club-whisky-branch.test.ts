import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  activeClubWhiskyAccountAppliesToBranch,
  readClubWhiskyBranchId,
} from "./club-whisky-branch";

describe("Dose Club branch scope", () => {
  const branchA = "11111111-1111-4111-8111-111111111111";
  const branchB = "22222222-2222-4222-8222-222222222222";

  it("rejects an active legacy account without a branch before shift close", () => {
    expect(() => activeClubWhiskyAccountAppliesToBranch({}, branchA, [branchA])).toThrow(
      BadRequestException,
    );
  });

  it("applies the close gate only to the exact configured branch", () => {
    expect(activeClubWhiskyAccountAppliesToBranch({ branchId: branchA }, branchA, [branchA])).toBe(
      true,
    );
    expect(activeClubWhiskyAccountAppliesToBranch({ branchId: branchA }, branchB, [branchA])).toBe(
      false,
    );
  });

  it("does not treat blank branch configuration as tenant-wide", () => {
    expect(readClubWhiskyBranchId({ branchId: "  " })).toBeNull();
  });

  it("rejects a nonexistent legacy branch so pending events cannot escape the close gate", () => {
    expect(() =>
      activeClubWhiskyAccountAppliesToBranch({ branchId: branchA }, branchA, []),
    ).toThrow(BadRequestException);
  });

  it("rejects a branch owned by another tenant", () => {
    expect(() =>
      activeClubWhiskyAccountAppliesToBranch({ branchId: branchB }, branchA, [branchA]),
    ).toThrow(BadRequestException);
  });
});
