import { describe, expect, it } from "vitest";
import { fiscalRetryAt } from "./fiscal-operations";

describe("fiscalRetryAt", () => {
  it("backs off with bounded jitter", () => {
    expect(fiscalRetryAt(1, 0, () => 0).getTime()).toBe(750);
    expect(fiscalRetryAt(20, 0, () => 1).getTime()).toBe(900_000);
  });
});
