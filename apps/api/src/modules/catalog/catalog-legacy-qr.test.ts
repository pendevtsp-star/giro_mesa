import { describe, expect, it } from "vitest";
import { isLegacyQrAllowed, readLegacyQrTenantSlug } from "./catalog.service";

describe("legacy QR policy", () => {
  it("requires an explicit enabled flag and configured demo slug", () => {
    expect(
      readLegacyQrTenantSlug({ LEGACY_QR_ENABLED: "false", LEGACY_QR_TENANT_SLUG: "demo" }),
    ).toBe(null);
    expect(
      readLegacyQrTenantSlug({ LEGACY_QR_ENABLED: "true", LEGACY_QR_TENANT_SLUG: "  demo  " }),
    ).toBe("demo");
    expect(readLegacyQrTenantSlug({ LEGACY_QR_ENABLED: "true" })).toBe(null);
  });

  it("allows only the configured demo tenant", () => {
    const env = { LEGACY_QR_ENABLED: "true", LEGACY_QR_TENANT_SLUG: "demo" };
    expect(isLegacyQrAllowed({ isDemo: true, slug: "demo" }, env)).toBe(true);
    expect(isLegacyQrAllowed({ isDemo: true, slug: "other" }, env)).toBe(false);
    expect(isLegacyQrAllowed({ isDemo: false, slug: "demo" }, env)).toBe(false);
  });
});
