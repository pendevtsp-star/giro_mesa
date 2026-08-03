export const commercialProductCodes = ["giromesa", "doseclub", "bundle"] as const;
export type CommercialProductCode = (typeof commercialProductCodes)[number];

export const ecosystemEntitlementCodes = [
  "giromesa.subscription",
  "doseclub.subscription",
  "bundle",
  "integration.shared_inventory",
] as const;
export type EcosystemEntitlementCode = (typeof ecosystemEntitlementCodes)[number];

export const giromesaPlanCatalog = {
  starter: {
    name: "Starter",
    priceCents: 14_900,
    limits: { branches: 1, users: 5, products: 150 },
  },
  professional: {
    name: "Professional",
    priceCents: 29_900,
    limits: { branches: 2, users: 15, products: 600 },
  },
  premium: {
    name: "Premium",
    priceCents: 49_900,
    limits: { branches: 5, users: 40, products: 2_000 },
  },
} as const;

export type GiromesaPlanCode = keyof typeof giromesaPlanCatalog;

export type CommercialOffer = {
  code: string;
  name: string;
  priceCents: number | null;
  billingPeriod: "month" | null;
  salesMode: "self_service" | "sales_assisted";
  limits: Record<string, number | boolean | string>;
};

export const commercialProductCatalog = [
  {
    code: "giromesa",
    name: "GiroMesa",
    entitlements: ["giromesa.subscription"],
    purchaseUrl: "https://giromesa.com.br/teste-gratis",
    offers: Object.entries(giromesaPlanCatalog).map(([code, offer]) => ({
      code,
      ...offer,
      billingPeriod: "month" as const,
      salesMode: "self_service" as const,
    })),
  },
  {
    code: "doseclub",
    name: "Dose Club",
    entitlements: ["doseclub.subscription"],
    purchaseUrl: "https://doseclube.giromesa.com.br/login?product=doseclub#onboard",
    offers: [
      {
        code: "doseclub_starter",
        name: "Starter",
        priceCents: 29_000,
        billingPeriod: "month",
        salesMode: "self_service",
        limits: { branches: 1, members: 50, audit: false },
      },
      {
        code: "doseclub_pro",
        name: "Pro",
        priceCents: 85_000,
        billingPeriod: "month",
        salesMode: "self_service",
        limits: { branches: 3, members: "unlimited", audit: true, api: true },
      },
      {
        code: "doseclub_enterprise",
        name: "Enterprise",
        priceCents: null,
        billingPeriod: null,
        salesMode: "sales_assisted",
        limits: { branches: "custom", members: "unlimited", audit: true, api: true },
      },
    ],
  },
  {
    code: "bundle",
    name: "GiroMesa + Dose Club",
    entitlements: ["giromesa.subscription", "doseclub.subscription", "bundle"],
    purchaseUrl: "https://doseclube.giromesa.com.br/login?product=bundle#onboard",
    offers: [
      {
        code: "bundle_custom",
        name: "GiroMesa + Dose Club",
        priceCents: null,
        billingPeriod: null,
        salesMode: "sales_assisted",
        limits: { giromesa: true, doseclub: true },
      },
    ],
  },
] as const satisfies ReadonlyArray<{
  code: CommercialProductCode;
  name: string;
  entitlements: readonly EcosystemEntitlementCode[];
  purchaseUrl: string;
  offers: readonly CommercialOffer[];
}>;

export function entitlementsForProduct(product: CommercialProductCode) {
  return [...(commercialProductCatalog.find((item) => item.code === product)?.entitlements ?? [])];
}
