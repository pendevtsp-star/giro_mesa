import { afterEach, describe, expect, it } from "vitest";
import {
  activateIntegrationSchema,
  clubSaleSchema,
  configureSchema,
  doseConsumptionSchema,
  integrationHealthSchema,
  revokeIntegrationSchema,
} from "./club-whisky.controller";

describe("Dose Club integration request security", () => {
  const branchId = "11111111-1111-4111-8111-111111111111";
  afterEach(() => {
    delete process.env.CLUB_WHISKY_API_BASE_URL;
    process.env.NODE_ENV = "test";
  });

  it("enforces mutually exclusive product fields for individual and combo sales", () => {
    expect(() =>
      clubSaleSchema.parse({
        branchId,
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

  it("accepts an optional order correlation without changing the consumption contract", () => {
    expect(
      doseConsumptionSchema.parse({
        branchId: "branch-a",
        orderId: "00000000-0000-4000-8000-000000000001",
        productId: "product-a",
        externalClubId: "club-a",
        externalConsumptionId: "consumption-a",
        idempotencyKey: "consumption-key-b",
      }),
    ).toMatchObject({ orderId: "00000000-0000-4000-8000-000000000001" });
  });

  it("allows only approved webhook targets and secret reference names", () => {
    process.env.NODE_ENV = "production";

    expect(
      configureSchema.parse({
        branchId,
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

  it("rejects activation without an explicit branch", () => {
    expect(() =>
      configureSchema.parse({
        webhookUrl: "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
      }),
    ).toThrow();
  });

  it("validates versioned lifecycle commands", () => {
    expect(
      activateIntegrationSchema.parse({
        expectedVersion: 1,
        contractVersion: "2026-07-30",
        evidence: "Joint homologation evidence",
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(() =>
      activateIntegrationSchema.parse({
        expectedVersion: 1,
        contractVersion: "unversioned",
        evidence: "Joint homologation evidence",
      }),
    ).toThrow();
    expect(
      integrationHealthSchema.parse({ expectedVersion: 2, healthy: false, detail: "probe failed" }),
    ).toMatchObject({ healthy: false });
    expect(
      revokeIntegrationSchema.parse({ expectedVersion: 3, reason: "tenant requested revocation" }),
    ).toMatchObject({ expectedVersion: 3 });
  });
});
