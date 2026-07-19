export const TRIAL_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export type BillingAccessStatus =
  | "healthy"
  | "trial_ok"
  | "trial_ending"
  | "payment_required"
  | "access_blocked";

export type TrialWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function createTrialWindow(now = new Date()): TrialWindow {
  return {
    startsAt: now,
    endsAt: new Date(now.getTime() + TRIAL_DURATION_MS),
  };
}

export function trialDaysRemaining(
  currentPeriodEndsAt: Date | string | null | undefined,
  now = new Date(),
) {
  if (!currentPeriodEndsAt) {
    return null;
  }
  const endsAt =
    currentPeriodEndsAt instanceof Date ? currentPeriodEndsAt : new Date(currentPeriodEndsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export function billingStatusForTenant(
  status: "trial" | "active" | "past_due" | "suspended" | "canceled" | null | undefined,
  currentPeriodEndsAt: Date | string | null | undefined,
  now = new Date(),
): BillingAccessStatus {
  if (status === "active") {
    return "healthy";
  }
  if (status === "past_due") {
    return "payment_required";
  }
  if (status === "suspended" || status === "canceled") {
    return "access_blocked";
  }
  if (status === "trial") {
    const daysRemaining = trialDaysRemaining(currentPeriodEndsAt, now);
    if (daysRemaining === 0) {
      return "payment_required";
    }
    return daysRemaining !== null && daysRemaining <= 3 ? "trial_ending" : "trial_ok";
  }
  return "access_blocked";
}
