import { describe, expect, it } from "vitest";
import { sanitizeQrFontPreset } from "./qr.service";

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
