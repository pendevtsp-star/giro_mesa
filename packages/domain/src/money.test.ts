import { describe, expect, it } from "vitest";
import { calculateOrderTotal, splitAmount } from "./money";

describe("calculateOrderTotal", () => {
  it("calculates discounts, service charge and fees in cents", () => {
    const total = calculateOrderTotal({
      lines: [
        { quantity: 2, unitPriceCents: 2500, discountCents: 500 },
        { quantity: 1, unitPriceCents: 1200, serviceChargeEligible: false },
      ],
      orderDiscountCents: 200,
      serviceChargeRate: 0.1,
      couvertCents: 300,
    });

    expect(total).toEqual({
      subtotalCents: 6200,
      discountCents: 700,
      serviceChargeCents: 450,
      deliveryFeeCents: 0,
      couvertCents: 300,
      totalCents: 6250,
    });
  });
});

describe("splitAmount", () => {
  it("keeps cents balanced across participants", () => {
    expect(splitAmount(1000, 3)).toEqual([334, 333, 333]);
  });
});
