import { describe, expect, it } from "vitest";
import { resolvePublicPartnerAttribution } from "./qr.service";

describe("public QR partner attribution", () => {
  it("exposes the DoseClub signature only for an active, branch-scoped integration", () => {
    expect(
      resolvePublicPartnerAttribution({
        accountStatus: "active",
        configuredBranchId: "branch-a",
        branchId: "branch-a",
      }),
    ).toEqual({
      product: "doseclub",
      label: "DoseClub, por GiroMesa",
      href: "https://doseclube.giromesa.com.br",
    });
  });

  it.each([
    { accountStatus: "disabled", configuredBranchId: "branch-a" },
    { accountStatus: "active", configuredBranchId: "branch-b" },
    { accountStatus: "active", configuredBranchId: null },
  ])("does not expose attribution for an ineligible integration: %j", (input) => {
    expect(
      resolvePublicPartnerAttribution({
        ...input,
        branchId: "branch-a",
      }),
    ).toBeUndefined();
  });

  it("allows the tenant's explicit marketing opt-out to suppress the signature", () => {
    expect(
      resolvePublicPartnerAttribution({
        accountStatus: "active",
        configuredBranchId: "branch-a",
        branchId: "branch-a",
        marketingEnabled: false,
      }),
    ).toBeUndefined();
  });
});
