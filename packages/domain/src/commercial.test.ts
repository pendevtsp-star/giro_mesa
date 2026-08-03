import { describe, expect, it } from "vitest";
import {
  commercialProductCatalog,
  entitlementsForProduct,
  giromesaPlanCatalog,
} from "./commercial";

describe("commercial product catalog", () => {
  it("keeps the three products independent and grants both subscriptions only through bundle", () => {
    expect(commercialProductCatalog.map((item) => item.code)).toEqual([
      "giromesa",
      "doseclub",
      "bundle",
    ]);
    expect(entitlementsForProduct("doseclub")).toEqual(["doseclub.subscription"]);
    expect(entitlementsForProduct("bundle")).toEqual([
      "giromesa.subscription",
      "doseclub.subscription",
      "bundle",
    ]);
    expect(giromesaPlanCatalog.professional.priceCents).toBe(29_900);
    expect(
      commercialProductCatalog.find((item) => item.code === "doseclub")?.offers[0]?.priceCents,
    ).toBe(29_000);
  });
});
