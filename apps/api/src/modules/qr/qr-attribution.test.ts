import { describe, expect, it } from "vitest";
import { resolvePublicPartnerAttribution } from "./qr.service";

describe("public QR partner attribution", () => {
  it("exposes the DoseClub signature only for an active, branch-scoped integration", () => {
    const result = resolvePublicPartnerAttribution({
      accountStatus: "active",
      configuredBranchId: "branch-a",
      branchId: "branch-a",
    });
    expect(result).toEqual({
      product: "doseclub",
      label: "DoseClub, por GiroMesa",
      href: "https://doseclube.giromesa.com.br/?utm_source=giromesa_qr&utm_medium=qr&utm_campaign=organic_attribution",
    });

    if (!result) throw new Error("Expected partner attribution");
    const href = new URL(result.href);
    expect(href.searchParams.get("utm_source")).toBe("giromesa_qr");
    expect(href.searchParams.get("utm_medium")).toBe("qr");
    expect(href.searchParams.get("utm_campaign")).toBe("organic_attribution");
    expect(href.search).not.toMatch(/table|order|tenant|token/i);
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
