import { describe, expect, it } from "vitest";
import { decideDiscountFlow, requiresCancellationApproval } from "./operational-exceptions";

describe("operational exception decisions", () => {
  it("applies a discount inside the configured basis-point limit", () => {
    expect(
      decideDiscountFlow({
        subtotalCents: 10_000,
        amountCents: 500,
        maxDiscountWithoutApprovalBps: 500,
      }),
    ).toBe("apply");
  });

  it("requests approval when a discount exceeds the configured limit", () => {
    expect(
      decideDiscountFlow({
        subtotalCents: 10_000,
        amountCents: 501,
        maxDiscountWithoutApprovalBps: 500,
      }),
    ).toBe("request_approval");
  });

  it("cancels pending items directly and protects items already sent", () => {
    expect(requiresCancellationApproval("pending", true)).toBe(false);
    expect(requiresCancellationApproval("sent", true)).toBe(true);
    expect(requiresCancellationApproval("preparing", true)).toBe(true);
    expect(requiresCancellationApproval("ready", true)).toBe(true);
    expect(requiresCancellationApproval("served", true)).toBe(true);
  });
});
