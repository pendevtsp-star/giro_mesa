import { afterEach, describe, expect, it, vi } from "vitest";
import { createSanitizedLogger, sanitizeSensitiveData } from "./sensitive-data";

afterEach(() => vi.restoreAllMocks());

describe("shared sanitizer", () => {
  it("preserves operational context and special values", () => {
    const error = Object.assign(new Error("person@example.test failed"), {
      code: "E_SEND",
      correlationId: "corr-1",
    });
    const value = sanitizeSensitiveData({
      error,
      date: new Date("2026-08-05T00:00:00.000Z"),
      map: new Map([["phone", "+55 11 99999-0000"]]),
    });
    expect(value.error).toBeInstanceOf(Error);
    expect(value.error.message).toBe("[REDACTED] failed");
    expect(value.error.code).toBe("E_SEND");
    expect(value.error.correlationId).toBe("corr-1");
    expect(value.date).toBeInstanceOf(Date);
    expect(value.map).toBeInstanceOf(Map);
  });

  it("sanitizes the shared worker logger boundary", () => {
    const output = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createSanitizedLogger("worker");
    logger.warn("failed for person@example.test", {
      authorization: "Bearer synthetic-secret",
      requestId: "req-1",
    });
    expect(output).toHaveBeenCalledWith("[worker]", "failed for [REDACTED]", {
      authorization: "[REDACTED]",
      requestId: "req-1",
    });
  });
});
