import { describe, expect, it } from "vitest";
import { billingStatusForTenant, createTrialWindow, TRIAL_DAYS, trialDaysRemaining } from "./trial";

describe("trial domain rules", () => {
  it("creates a seven-day trial window without card requirement", () => {
    const startsAt = new Date("2026-07-19T12:00:00.000Z");

    const window = createTrialWindow(startsAt);

    expect(TRIAL_DAYS).toBe(7);
    expect(window.startsAt).toEqual(startsAt);
    expect(window.endsAt.toISOString()).toBe("2026-07-26T12:00:00.000Z");
  });

  it("calculates remaining trial days with a commercial warning window", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const endsAt = new Date("2026-07-22T12:00:00.000Z");

    expect(trialDaysRemaining(endsAt, now)).toBe(3);
    expect(billingStatusForTenant("trial", endsAt, now)).toBe("trial_ending");
  });

  it("requires payment when the trial is expired", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const endsAt = new Date("2026-07-26T12:00:00.000Z");

    expect(trialDaysRemaining(endsAt, now)).toBe(0);
    expect(billingStatusForTenant("trial", endsAt, now)).toBe("payment_required");
  });
});
