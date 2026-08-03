import { describe, expect, it } from "vitest";
import { qrExperienceSchema } from "./qr.controller";
import { sanitizeQrPersonalization } from "./qr.service";

const categoryId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";

describe("premium QR identity gate", () => {
  it("accepts controlled identity, translations, recommendations, and service reasons", () => {
    expect(
      qrExperienceSchema.parse({
        template: "gastronomia",
        primaryColor: "#123456",
        fontPreset: "serif",
        coverUrl: "/uploads/qr-cover.webp",
        language: "en",
        categoryLabels: { [categoryId]: "House picks" },
        recommendedProductIds: [productId],
        serviceRequestReasons: ["More napkins"],
      }),
    ).toMatchObject({
      template: "gastronomia",
      language: "en",
      categoryLabels: { [categoryId]: "House picks" },
    });
  });

  it.each([
    { customCss: ".brand { display: none }" },
    { customScript: "alert(document.cookie)" },
    { coverUrl: "javascript:alert(1)" },
    { fontPreset: "url(https://example.test/font.css)" },
  ])("rejects free code and unsafe identity input: %j", (input) => {
    expect(() => qrExperienceSchema.parse(input)).toThrow();
  });

  it("deduplicates and bounds persisted personalization from historical JSON", () => {
    expect(
      sanitizeQrPersonalization({
        categoryLabels: { [categoryId]: "  House picks  ", invalid: "ignored" },
        recommendedProductIds: [productId, productId, "invalid"],
        serviceRequestReasons: ["  More napkins  ", "More napkins", ""],
      }),
    ).toEqual({
      categoryLabels: { [categoryId]: "House picks" },
      recommendedProductIds: [productId],
      serviceRequestReasons: ["More napkins"],
    });
  });
});
