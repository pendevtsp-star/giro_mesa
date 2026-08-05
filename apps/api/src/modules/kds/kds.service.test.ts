import { describe, expect, it } from "vitest";
import { assertKdsTransition } from "./kds.service";

describe("KDS return transition", () => {
  it("allows only the explicit ready to preparing return", () => {
    expect(() => assertKdsTransition("ready", "preparing")).not.toThrow();
    expect(() => assertKdsTransition("served", "ready")).toThrow(
      "Invalid transition from served to ready",
    );
  });
});
