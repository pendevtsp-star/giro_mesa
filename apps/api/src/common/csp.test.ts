import { describe, expect, it } from "vitest";
import { cspHeader } from "./csp";

describe("cspHeader", () => {
  it("always keeps the effective API policy blocking", () => {
    expect(cspHeader().key).toBe("content-security-policy");
  });
});
