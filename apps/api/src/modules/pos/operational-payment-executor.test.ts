import { describe, expect, it } from "vitest";
import { LocalPaymentSimulator, operationalPaymentExecutor } from "./operational-payment-executor";

describe("operational payment executor", () => {
  it("never simulates a production payment", async () => {
    await expect(
      new LocalPaymentSimulator().initiate({
        id: "intent",
        executionMode: "smartpos",
        environment: "production",
        amountCents: 100,
      }),
    ).rejects.toThrow("disabled in production");
  });

  it("keeps unconfigured hardware fail-closed", async () => {
    await expect(
      operationalPaymentExecutor("tef").initiate({
        id: "intent",
        executionMode: "tef",
        environment: "test",
        amountCents: 100,
      }),
    ).resolves.toEqual({ status: "not_configured" });
  });
});
