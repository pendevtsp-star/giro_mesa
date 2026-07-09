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
  method: string;
  amountCents: number;
  provider: string;
  status: string;
};

type BuildFocusNfeNfcePayloadInput = {
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

export function buildFocusNfeNfcePayload(input: BuildFocusNfeNfcePayloadInput) {
  const configPayload = readObject(input.settings.config.focusNfePayload);
  const totalPaid = input.payments
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  return {
    ...configPayload,
    cnpj_emitente: onlyDigits(input.settings.document),
    data_emissao: new Date().toISOString(),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    modalidade_frete: "9",
    local_destino: "1",
    presenca_comprador: readPresence(input.order.channel),
    indicador_inscricao_estadual_destinatario: "9",
    numero: String(input.number),
    serie: input.settings.series,
    items: input.items.map((item) => ({
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
      inclui_no_total: "1",
      icms_origem: item.fiscalOrigin ?? "0",
      icms_situacao_tributaria: item.fiscalCst,
      icms_situacao_tributaria_simples_nacional: item.fiscalCsosn,
      icms_aliquota: percent(item.fiscalIcmsRate),
      pis_aliquota: percent(item.fiscalPisRate),
      cofins_aliquota: percent(item.fiscalCofinsRate),
    })),
    formas_pagamento: buildPaymentDetails(input.payments, input.order.totalCents),
    valor_troco: money(Math.max(totalPaid - input.order.totalCents, 0)),
    informacoes_adicionais_contribuinte:
      "Documento fiscal gerado pelo GiroMesa. Validar regras fiscais com contador.",
  };
}

function buildPaymentDetails(payments: FiscalPayment[], orderTotalCents: number) {
  const confirmed = payments.filter((payment) => payment.status === "confirmed");
  const source =
    confirmed.length > 0 ? confirmed : [{ method: "invoiced", amountCents: orderTotalCents }];

  return source.map((payment) => ({
    forma_pagamento: paymentMethodCodes[payment.method] ?? "99",
    valor_pagamento: money(payment.amountCents),
  }));
}

function readPresence(channel: string) {
  if (channel === "delivery" || channel === "qr") {
    return "4";
  }
  return "1";
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function decimal(value: string) {
  return Number(value).toFixed(4);
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
