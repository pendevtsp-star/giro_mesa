import { summarizeNetChargeAllocations } from "../../common/payment-ledger";

type FiscalOrder = {
  id: string;
  branchId: string;
  channel: string;
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  deliveryFeeCents: number;
  totalCents: number;
};

type FiscalSettings = {
  provider: string;
  environment: string;
  series: string;
  legalName: string | null;
  tradeName: string | null;
  document: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  taxRegime: string;
  uf: string | null;
  cityCode: string | null;
  cityName: string | null;
  config: Record<string, unknown>;
};

type FiscalItem = {
  id: string;
  productId: string;
  nameSnapshot: string;
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
  fiscalNcm: string | null;
  fiscalCfop: string | null;
  fiscalCest: string | null;
  fiscalOrigin: string | null;
  fiscalCst: string | null;
  fiscalCsosn: string | null;
  fiscalIcmsRate: string | null;
  fiscalPisRate: string | null;
  fiscalCofinsRate: string | null;
};

type FiscalPayment = {
  id: string;
  method: string;
  amountCents: number;
  provider: string;
  status: string;
  paymentType: string;
  originalPaymentId: string | null;
};

type BuildNuvemFiscalNfcePayloadInput = {
  fiscalDocumentId: string;
  model: "nfce" | "nfe" | "nfse";
  number: number;
  order: FiscalOrder;
  settings: FiscalSettings;
  items: FiscalItem[];
  payments: FiscalPayment[];
};

const paymentMethodCodes: Record<string, string> = {
  cash: "01",
  credit_card: "03",
  debit_card: "04",
  meal_voucher: "10",
  voucher: "99",
  pix_manual: "17",
  pix_integrated: "17",
  internal_credit: "99",
  courtesy: "90",
  invoiced: "99",
};

export function buildNuvemFiscalNfcePayload(input: BuildNuvemFiscalNfcePayloadInput) {
  const configPayload = readObject(input.settings.config.nuvemFiscalPayload);
  const ambiente = input.settings.environment === "production" ? "producao" : "homologacao";
  const issuerDocument = onlyDigits(input.settings.document);
  const totalProducts = input.items.reduce((sum, item) => sum + item.totalCents, 0);
  const netPayments = summarizeNetChargeAllocations(input.payments);
  assertFiscalPaymentCoverage(netPayments.totalCents, input.order.totalCents);

  return {
    ...configPayload,
    ambiente,
    referencia: input.fiscalDocumentId,
    pedido: input.order.id,
    infNFe: {
      versao: "4.00",
      ide: {
        modelo: "65",
        serie: input.settings.series,
        numero: input.number,
        natureza_operacao: "Venda",
        tipo_operacao: "saida",
        destino_operacao: "interna",
        finalidade_emissao: "normal",
        consumidor_final: true,
        presenca_comprador: readPresence(input.order.channel),
        municipio_codigo_fato_gerador: input.settings.cityCode,
      },
      emit: {
        cpf_cnpj: issuerDocument,
        razao_social: input.settings.legalName,
        nome_fantasia: input.settings.tradeName ?? input.settings.legalName,
        inscricao_estadual: input.settings.stateRegistration,
        inscricao_municipal: input.settings.municipalRegistration,
        regime_tributario: input.settings.taxRegime,
        uf: input.settings.uf,
        municipio_codigo: input.settings.cityCode,
        municipio: input.settings.cityName,
      },
      det: input.items.map((item, index) => ({
        numero_item: index + 1,
        prod: {
          codigo: item.productId,
          descricao: item.nameSnapshot,
          ncm: item.fiscalNcm,
          cest: item.fiscalCest,
          cfop: item.fiscalCfop ?? "5102",
          unidade_comercial: "UN",
          quantidade_comercial: decimal(item.quantity),
          valor_unitario_comercial: money(item.unitPriceCents),
          valor_bruto: money(item.totalCents),
          unidade_tributavel: "UN",
          quantidade_tributavel: decimal(item.quantity),
          valor_unitario_tributavel: money(item.unitPriceCents),
          ind_total: 1,
        },
        imposto: {
          icms: {
            origem: item.fiscalOrigin ?? "0",
            cst: item.fiscalCst,
            csosn: item.fiscalCsosn,
            aliquota: percent(item.fiscalIcmsRate),
          },
          pis: {
            aliquota: percent(item.fiscalPisRate),
          },
          cofins: {
            aliquota: percent(item.fiscalCofinsRate),
          },
        },
      })),
      total: {
        icms_tot: {
          valor_produtos: money(totalProducts),
          valor_desconto: money(input.order.discountCents),
          valor_frete: money(input.order.deliveryFeeCents),
          valor_outros: money(input.order.serviceChargeCents),
          valor_nf: money(input.order.totalCents),
        },
      },
      pag: {
        det_pag: buildPaymentDetails(netPayments.allocations),
        valor_troco: money(Math.max(netPayments.totalCents - input.order.totalCents, 0)),
      },
      inf_adic: {
        informacoes_complementares:
          "Documento fiscal gerado pelo GiroMesa. Validar regras fiscais com contador.",
      },
    },
  };
}

function buildPaymentDetails(allocations: Array<{ payment: FiscalPayment; amountCents: number }>) {
  return allocations.map(({ payment, amountCents }) => ({
    indicador_pagamento: "vista",
    meio_pagamento: paymentMethodCodes[payment.method] ?? "99",
    valor: money(amountCents),
  }));
}

function assertFiscalPaymentCoverage(netPaidCents: number, fiscalTotalCents: number) {
  if (netPaidCents < fiscalTotalCents) {
    throw new Error(
      "Net payment total after refunds does not cover the original fiscal document total",
    );
  }
}

function readPresence(channel: string) {
  if (channel === "delivery" || channel === "qr") {
    return "internet";
  }
  return "presencial";
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function decimal(value: string) {
  return Number(value).toFixed(3);
}

function percent(value: string | null) {
  return value ? Number(value).toFixed(4) : undefined;
}

function onlyDigits(value: string | null) {
  return value?.replace(/\D/g, "") ?? null;
}

function readObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
