import { describe, expect, it } from "vitest";
import { netChargeAllocations, netPaymentCents, paymentLedgerDeltaCents } from "./payment-ledger";

describe("payment ledger", () => {
  it("nets a linked refund against a confirmed charge", () => {
    const rows = [
      { id: "charge-1", amountCents: 11_00, status: "confirmed", paymentType: "charge" },
      {
        id: "refund-1",
        amountCents: 11_00,
        status: "refunded",
        paymentType: "refund",
        originalPaymentId: "charge-1",
      },
    ];
    expect(netPaymentCents(rows)).toBe(0);
    expect(netChargeAllocations(rows)).toEqual([]);
  });

  it("does not treat an unlinked refund or pending charge as financial value", () => {
    expect(
      paymentLedgerDeltaCents({ amountCents: 500, status: "refunded", paymentType: "refund" }),
    ).toBe(0);
    expect(
      paymentLedgerDeltaCents({ amountCents: 500, status: "pending", paymentType: "charge" }),
    ).toBe(0);
  });

  it("keeps a partial refund attached only to its original charge", () => {
    const rows = [
      { id: "charge-a", amountCents: 1_100, status: "confirmed", paymentType: "charge" },
      { id: "charge-b", amountCents: 500, status: "confirmed", paymentType: "charge" },
      {
        id: "refund-a",
        amountCents: 550,
        status: "refunded",
        paymentType: "refund",
        originalPaymentId: "charge-a",
      },
    ];
    expect(netChargeAllocations(rows)).toEqual([
      { payment: rows[0], amountCents: 550 },
      { payment: rows[1], amountCents: 500 },
    ]);
  });
});
