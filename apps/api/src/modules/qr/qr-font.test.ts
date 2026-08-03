import { describe, expect, it } from "vitest";
import { sanitizeQrExperienceAssetUrl, sanitizeQrFontPreset } from "./qr.service";

describe("QR font presets", () => {
  it.each(["system", "serif", "display"])("accepts curated preset %s", (value) => {
    expect(sanitizeQrFontPreset(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    "https://fonts.example.test/x.css",
    "body { color: red; }",
  ])("rejects arbitrary font payload %j", (value) => {
    expect(sanitizeQrFontPreset(value)).toBeUndefined();
  });
});

describe("QR experience assets", () => {
  it("allows only HTTPS or local uploads and supports clearing the cover", () => {
    expect(sanitizeQrExperienceAssetUrl("https://cdn.example.test/cover.webp")).toBe(
      "https://cdn.example.test/cover.webp",
    );
    expect(
      sanitizeQrExperienceAssetUrl('https://cdn.example.test/" onerror=alert(1)'),
    ).toBeUndefined();
    expect(sanitizeQrExperienceAssetUrl("/uploads/cover.webp")).toBe("/uploads/cover.webp");
    expect(sanitizeQrExperienceAssetUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeQrExperienceAssetUrl(null)).toBeNull();
  });
});
