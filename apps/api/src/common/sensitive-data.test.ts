import { describe, expect, it } from "vitest";
import { auditMetadata, sanitizeErrorMessage, sanitizeSensitiveData } from "./sensitive-data";

describe("sanitizeSensitiveData", () => {
  it("redacts sensitive keys recursively without removing operational context", () => {
    expect(
      sanitizeSensitiveData({
        eventId: "evt_1",
        email: "guest@example.com",
        nested: { token: "x" },
      }),
    ).toEqual({ eventId: "evt_1", email: "[REDACTED]", nested: { token: "[REDACTED]" } });
  });

  it("redacts inline provider credentials in thrown errors", () => {
    expect(
      sanitizeErrorMessage(new Error("upstream Authorization: Bearer test-token failed")),
    ).toContain("[REDACTED]");
  });

  it("preserves Error, code, stack, correlation, Date and Map context", () => {
    const error = Object.assign(new TypeError("guest@example.test failed"), {
      code: "UPSTREAM_TIMEOUT",
      correlationId: "corr-safe",
      token: "synthetic-token",
    });
    const at = new Date("2026-08-04T20:00:00.000Z");
    const mapped = new Map([["context", "safe"]]);
    const sanitized = sanitizeSensitiveData({ error, at, mapped, pinnedStation: "bar" });
    expect(sanitized.error).toBeInstanceOf(TypeError);
    expect(sanitized.error).toMatchObject({
      name: "TypeError",
      code: "UPSTREAM_TIMEOUT",
      correlationId: "corr-safe",
      token: "[REDACTED]",
    });
    expect(sanitized.error.message).not.toContain("@");
    expect(sanitized.error.stack).toBeTypeOf("string");
    expect(sanitized.at).toBeInstanceOf(Date);
    expect(sanitized.mapped).toBeInstanceOf(Map);
    expect(sanitized.pinnedStation).toBe("bar");
  });

  it("sanitizes audit metadata and free-form PII", () => {
    expect(
      auditMetadata({ requestId: "req-safe", note: "contact guest@example.test", password: "x" }),
    ).toEqual({ requestId: "req-safe", note: "contact [REDACTED]", password: "[REDACTED]" });
  });
});
