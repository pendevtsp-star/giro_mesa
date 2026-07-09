import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { RateLimitService } from "./rate-limit";

describe("RateLimitService", () => {
  it("allows requests inside the configured window and rejects excess requests", () => {
    const service = new RateLimitService();
    const headers = { "x-forwarded-for": "203.0.113.10" };

    service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 });
    service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 });

    expect(() =>
      service.assertAllowed(headers, { namespace: "test", limit: 2, windowMs: 60_000 }),
    ).toThrow(HttpException);
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
});
