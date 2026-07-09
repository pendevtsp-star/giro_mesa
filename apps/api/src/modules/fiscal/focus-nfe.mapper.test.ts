import { describe, expect, it } from "vitest";
import { buildFocusNfeNfcePayload } from "./focus-nfe.mapper";

describe("buildFocusNfeNfcePayload", () => {
  it("maps a GiroMesa paid counter order to a Focus NFe NFC-e payload", () => {
    const payload = buildFocusNfeNfcePayload({
      fiscalDocumentId: "document-001",
      model: "nfce",
      number: 42,
      order: {
        id: "order-001",
        branchId: "branch-001",
        channel: "counter",
        subtotalCents: 6800,
        discountCents: 300,
        serviceChargeCents: 0,
        deliveryFeeCents: 0,
        totalCents: 6500,
      },
      settings: {
        provider: "focus_nfe",
        environment: "homologation",
        series: "1",
        legalName: "Bar Aurora LTDA",
        tradeName: "Bar Aurora",
        document: "00.000.000/0001-91",
        stateRegistration: "ISENTO",
        municipalRegistration: null,
        taxRegime: "simples_nacional",
        uf: "SP",
        cityCode: "3550308",
        cityName: "Sao Paulo",
        config: {},
      },
      items: [
        {
          id: "item-001",
          productId: "product-001",
          nameSnapshot: "Chopp Pilsen 400ml",
          quantity: "2",
          unitPriceCents: 3400,
          totalCents: 6800,
          fiscalNcm: "22030000",
          fiscalCfop: "5102",
          fiscalCest: null,
          fiscalOrigin: "0",
          fiscalCst: null,
          fiscalCsosn: "102",
          fiscalIcmsRate: null,
          fiscalPisRate: null,
          fiscalCofinsRate: null,
        },
      ],
      payments: [
        {
          method: "pix_manual",
          amountCents: 6500,
          provider: "manual",
          status: "confirmed",
        },
      ],
    });

    expect(payload.cnpj_emitente).toBe("00000000000191");
    expect(payload.presenca_comprador).toBe("1");
    expect(payload.modalidade_frete).toBe("9");
    expect(payload.numero).toBe("42");
    expect(payload.serie).toBe("1");
    expect(payload.items[0]?.ncm).toBe("22030000");
    expect(payload.items[0]?.cfop).toBe("5102");
    expect(payload.items[0]?.valor_unitario_comercial).toBe("34.00");
    expect(payload.formas_pagamento[0]?.forma_pagamento).toBe("17");
    expect(payload.formas_pagamento[0]?.valor_pagamento).toBe("65.00");
  });

  it("allows tenant-specific Focus NFe payload overrides from fiscal settings config", () => {
    const payload = buildFocusNfeNfcePayload({
      fiscalDocumentId: "document-002",
      model: "nfce",
      number: 3,
      order: {
        id: "order-002",
        branchId: "branch-001",
        channel: "delivery",
        subtotalCents: 1000,
        discountCents: 0,
        serviceChargeCents: 0,
        deliveryFeeCents: 0,
        totalCents: 1000,
      },
      settings: {
        provider: "focus_nfe",
        environment: "production",
        series: "9",
        legalName: "Bar Aurora LTDA",
        tradeName: null,
        document: "00000000000191",
        stateRegistration: null,
        municipalRegistration: null,
        taxRegime: "simples_nacional",
        uf: "SP",
        cityCode: "3550308",
        cityName: "Sao Paulo",
        config: { focusNfePayload: { custom_field: "custom-value" } },
      },
      items: [],
      payments: [],
    });

    expect((payload as Record<string, unknown>).custom_field).toBe("custom-value");
    expect(payload.presenca_comprador).toBe("4");
  });
});
