import { afterEach, describe, expect, it } from "vitest";
import { clubSaleSchema, configureSchema, doseConsumptionSchema } from "./club-whisky.controller";

describe("Dose Club integration request security", () => {
  afterEach(() => {
    delete process.env.CLUB_WHISKY_API_BASE_URL;
    process.env.NODE_ENV = "test";
  });

  it("enforces mutually exclusive product fields for individual and combo sales", () => {
    expect(() =>
      clubSaleSchema.parse({
        branchId: "branch-a",
        saleType: "individual",
        productId: "product-a",
        eligibleProductIds: ["product-a", "product-b"],
        quantityBottles: 1,
        externalClubId: "club-a",
        idempotencyKey: "sale-key-a",
      }),
    ).toThrow();

    expect(() =>
      clubSaleSchema.parse({
        branchId: "branch-a",
        saleType: "combo_pool",
        productId: "product-a",
        eligibleProductIds: ["product-a", "product-b"],
        quantityBottles: 1,
        totalDoses: 20,
        externalClubId: "club-a",
        idempotencyKey: "sale-key-b",
      }),
    ).toThrow();

    expect(() =>
      clubSaleSchema.parse({
        branchId: "branch-a",
        saleType: "combo_pool",
        eligibleProductIds: ["product-a", "product-a"],
        quantityBottles: 1,
        totalDoses: 20,
        externalClubId: "club-a",
        idempotencyKey: "sale-key-c",
      }),
    ).toThrow();
  });

  it("rejects unknown properties including tenant overrides", () => {
    expect(() =>
      doseConsumptionSchema.parse({
        branchId: "branch-a",
        productId: "product-a",
        externalClubId: "club-a",
        externalConsumptionId: "consumption-a",
        doseMl: 50,
        idempotencyKey: "consumption-key-a",
        tenantId: "attacker-tenant",
      }),
    ).toThrow();
  });

  it("allows only approved webhook targets and secret reference names", () => {
    process.env.NODE_ENV = "production";

    expect(
      configureSchema.parse({
        webhookUrl: "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
        webhookSecretRef: "CLUB_WHISKY_WEBHOOK_SECRET_TENANT_A",
      }),
    ).toMatchObject({
      webhookSecretRef: "CLUB_WHISKY_WEBHOOK_SECRET_TENANT_A",
    });

    expect(() =>
      configureSchema.parse({
        webhookUrl: "https://attacker.example/webhook",
        webhookSecretRef: "UNSAFE_SECRET_NAME",
      }),
    ).toThrow();
  });
});
