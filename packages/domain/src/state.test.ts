import { describe, expect, it } from "vitest";
import { stateMachines } from "./state";

describe("stateMachines", () => {
  it("allows valid order transitions", () => {
    expect(() => stateMachines.assertOrderTransition("opened", "sent_to_kitchen")).not.toThrow();
  });

  it("rejects destructive order transitions", () => {
    expect(() => stateMachines.assertOrderTransition("paid", "opened")).toThrow(
      "Invalid transition",
    );
  });

  it("allows pending approvals to be approved and keeps approved final", () => {
    expect(() => stateMachines.assertApprovalTransition("pending", "approved")).not.toThrow();
    expect(() => stateMachines.assertApprovalTransition("approved", "pending")).toThrow(
      "Invalid transition",
    );
  });

  it("allows pending cash handovers to be received and keeps received final", () => {
    expect(() => stateMachines.assertCashHandoverTransition("pending", "received")).not.toThrow();
    expect(() => stateMachines.assertCashHandoverTransition("received", "pending")).toThrow(
      "Invalid transition",
    );
  });
});
