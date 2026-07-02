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
});
