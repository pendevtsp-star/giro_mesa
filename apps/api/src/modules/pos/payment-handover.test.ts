import { describe, expect, it } from "vitest";
import { resolveCashHandoverStatus } from "./payment-handover";

describe("resolveCashHandoverStatus", () => {
  it("marks waiter cash as pending physical handover", () => {
    expect(resolveCashHandoverStatus("cash", "waiter")).toBe("pending");
  });

  it("marks cashier cash as already received", () => {
    expect(resolveCashHandoverStatus("cash", "cashier")).toBe("received");
  });

  it("does not require handover for electronic waiter payments", () => {
    expect(resolveCashHandoverStatus("pix_manual", "waiter")).toBe("not_required");
    expect(resolveCashHandoverStatus("credit_card", "waiter")).toBe("not_required");
  });
});
