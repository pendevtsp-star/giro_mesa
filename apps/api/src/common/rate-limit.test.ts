import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitService, readClientIdentifier } from "./rate-limit";

describe("RateLimitService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests inside the configured window and rejects excess requests", () => {
    const service = new RateLimitService();
    const headers = { "x-forwarded-for": "203.0.113.10" };

    service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 });
    service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 });

    expect(() =>
      service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 }),
    ).toThrow(HttpException);
  });

  it("resets the bucket after the configured window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:00:00.000Z"));

    const service = new RateLimitService();
    const headers = { "x-forwarded-for": "203.0.113.10" };
    const rule = { namespace: "test-reset", limit: 1, windowMs: 1_000 };

    service.assertAllowed(headers, rule);
    expect(() => service.assertAllowed(headers, rule)).toThrow(HttpException);

    vi.setSystemTime(new Date("2026-07-18T10:00:01.001Z"));

    expect(() => service.assertAllowed(headers, rule)).not.toThrow();
  });

  it("separates buckets by explicit identifier", () => {
    const service = new RateLimitService();
    const headers = { "x-forwarded-for": "203.0.113.10" };

    service.assertAllowed(headers, {
      namespace: "test-explicit",
      limit: 1,
      windowMs: 60_000,
      identifier: "key-a",
    });
    service.assertAllowed(headers, {
      namespace: "test-explicit",
      limit: 1,
      windowMs: 60_000,
      identifier: "key-b",
    });

    expect(() =>
      service.assertAllowed(headers, {
        namespace: "test-explicit",
        limit: 1,
        windowMs: 60_000,
        identifier: "key-a",
      }),
    ).toThrow(HttpException);
  });

  it("uses the first forwarded IP as the client identifier behind proxies", () => {
    expect(readClientIdentifier({ "x-forwarded-for": "203.0.113.10, 198.51.100.20" })).toBe(
      readClientIdentifier({ "x-real-ip": "203.0.113.10" }),
    );
  });
});
