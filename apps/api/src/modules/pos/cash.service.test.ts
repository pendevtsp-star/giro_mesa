import { describe, expect, it } from "vitest";
import { deriveExpectedCashAmountCents } from "./cash.service";

describe("deriveExpectedCashAmountCents", () => {
  it("uses signed received handovers and movements as the canonical cash expectation", () => {
    expect(
      deriveExpectedCashAmountCents({
        openingAmountCents: 100,
        movements: [
          { type: "supply", amountCents: 200 },
          { type: "withdrawal", amountCents: 50 },
        ],
        handovers: [
          { status: "received", amountCents: 1_000 },
          { status: "received", amountCents: -400 },
          { status: "pending", amountCents: 300 },
        ],
      }),
    ).toBe(850);
  });
});
