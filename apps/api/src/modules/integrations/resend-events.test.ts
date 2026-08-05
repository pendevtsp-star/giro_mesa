import { describe, expect, it } from "vitest";
import { normalizeResendDeliveryEvent } from "./resend-events";

describe("normalizeResendDeliveryEvent", () => {
  it("marks bounce and complaint events as suppressed", () => {
    expect(
      normalizeResendDeliveryEvent({
        id: "evt_1",
        type: "email.bounced",
        data: { to: "guest@example.com" },
      }),
    ).toMatchObject({
      status: "suppressed",
      shouldSuppressRecipient: true,
    });
  });

  it("fails closed for an unknown event shape", () => {
    expect(normalizeResendDeliveryEvent({ id: "evt_1", type: "email.opened" })).toBeNull();
  });
});
