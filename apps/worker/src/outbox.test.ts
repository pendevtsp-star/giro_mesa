import { describe, expect, it } from "vitest";
import { calculateClubWhiskyRetryAt } from "./outbox";

describe("Dose Club outbox retry policy", () => {
  it("uses capped exponential backoff with jitter", () => {
    const now = Date.parse("2026-07-30T12:00:00.000Z");

    expect(calculateClubWhiskyRetryAt(1, now, () => 0.5).getTime() - now).toBe(1_000);
    expect(calculateClubWhiskyRetryAt(4, now, () => 0.5).getTime() - now).toBe(8_000);
    expect(calculateClubWhiskyRetryAt(30, now, () => 1).getTime() - now).toBe(15 * 60_000);
  });
});
