import { describe, expect, it } from "vitest";
import { normalizeQrFontPreset } from "./font-preset";

describe("public QR font rendering", () => {
  it.each(["system", "serif", "display"])("maps %s to a safe data attribute", (value) => {
    expect(normalizeQrFontPreset(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    "url(https://fonts.example.test/font.css)",
    "--custom-font",
  ])("falls back to system for arbitrary value %j", (value) => {
    expect(normalizeQrFontPreset(value)).toBe("system");
  });
});
