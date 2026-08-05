import { describe, expect, it } from "vitest";
import { buildCspHeaders } from "../../next.config.mjs";

describe("Next CSP headers", () => {
  it("keeps blocking CSP and adds report-only when enabled", async () => {
    const headers = buildCspHeaders(true, "production");
    expect(headers.some((header) => header.key === "Content-Security-Policy")).toBe(true);
    expect(headers.some((header) => header.key === "Content-Security-Policy-Report-Only")).toBe(
      true,
    );
    expect(headers.every((header) => !header.value.includes("'unsafe-eval'"))).toBe(true);
  });

  it("allows eval only for the Next development runtime", () => {
    const development = buildCspHeaders(false, "development");
    const production = buildCspHeaders(false, "production");
    expect(development[0]?.value).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(production[0]?.value).not.toContain("'unsafe-eval'");
  });
});
