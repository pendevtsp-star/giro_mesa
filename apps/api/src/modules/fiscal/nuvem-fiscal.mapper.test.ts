import { describe, expect, it } from "vitest";
import { buildNuvemFiscalNfcePayload } from "./nuvem-fiscal.mapper";

describe("buildNuvemFiscalNfcePayload", () => {
  it("maps a GiroMesa paid counter order to a structured Nuvem Fiscal NFC-e payload", () => {
    const payload = buildNuvemFiscalNfcePayload({
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
        provider: "nuvem_fiscal",
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

    expect(payload.ambiente).toBe("homologacao");
    expect(payload.referencia).toBe("document-001");
    expect(payload.infNFe.ide.modelo).toBe("65");
    expect(payload.infNFe.ide.numero).toBe(42);
    expect(payload.infNFe.emit.cpf_cnpj).toBe("00000000000191");
    expect(payload.infNFe.det[0]?.prod.ncm).toBe("22030000");
    expect(payload.infNFe.det[0]?.prod.cfop).toBe("5102");
    expect(payload.infNFe.total.icms_tot.valor_produtos).toBe("68.00");
    expect(payload.infNFe.total.icms_tot.valor_desconto).toBe("3.00");
    expect(payload.infNFe.total.icms_tot.valor_nf).toBe("65.00");
    expect(payload.infNFe.pag.det_pag[0]?.meio_pagamento).toBe("17");
    expect(payload.infNFe.pag.det_pag[0]?.valor).toBe("65.00");
  });

  it("allows tenant-specific Nuvem Fiscal payload overrides from fiscal settings config", () => {
    const payload = buildNuvemFiscalNfcePayload({
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
        provider: "nuvem_fiscal",
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
        config: { nuvemFiscalPayload: { custom_field: "custom-value" } },
      },
      items: [],
      payments: [],
    });

    expect(payload.ambiente).toBe("producao");
    expect((payload as Record<string, unknown>).custom_field).toBe("custom-value");
    expect(payload.infNFe.ide.presenca_comprador).toBe("internet");
  });
});
