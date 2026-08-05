import { describe, expect, it } from "vitest";
import {
  renderBillPreview,
  renderCashSummary,
  renderKitchenTicket,
  renderPaymentReceipt,
} from "./print-renderer";

describe("renderKitchenTicket", () => {
  it("renders a compact kitchen ticket with order, table and items", () => {
    const rendered = renderKitchenTicket({
      tenantName: "Bar Aurora",
      stationName: "Cozinha",
      orderCode: "order-01",
      orderChannel: "table",
      tableCode: "M03",
      createdAt: "2026-07-03T12:00:00.000Z",
      copies: 1,
      charactersPerLine: 32,
      items: [
        { name: "Burger Classico", quantity: "2", notes: "Sem cebola" },
        { name: "Chopp Pilsen 400ml", quantity: "1" },
      ],
    });

    expect(rendered).toContain("Bar Aurora");
    expect(rendered).toContain("COZINHA");
    expect(rendered).toContain("Mesa/Comanda: M03");
    expect(rendered).toContain("2x Burger Classico");
    expect(rendered).toContain("obs: Sem cebola");
    expect(rendered).toContain("1x Chopp Pilsen 400ml");
  });

  it("renders a branded bill preview without fiscal value", () => {
    const rendered = renderBillPreview({
      tenantName: "Bar Aurora",
      orderCode: "M03-01",
      tableCode: "M03",
      createdAt: "2026-07-03T12:00:00.000Z",
      charactersPerLine: 32,
      items: [{ name: "Burger Classico", quantity: "2", totalCents: 6400 }],
      subtotalCents: 6400,
      discountCents: 400,
      serviceChargeCents: 600,
      totalCents: 6600,
    });

    expect(rendered).toContain("Bar Aurora");
    expect(rendered).toContain("PRE-CONTA");
    expect(rendered).toContain("Emitido por GiroMesa");
    expect(rendered).toContain("Mesa/Comanda: M03");
    expect(rendered).toContain("Documento sem valor fiscal");
    expect(rendered).toContain("R$");
  });

  it("renders a cash summary for shift closing", () => {
    const rendered = renderCashSummary({
      tenantName: "Bar Aurora",
      operatorName: "Caixa 01",
      openedAt: "2026-07-03T12:00:00.000Z",
      closedAt: "2026-07-03T22:00:00.000Z",
      openingAmountCents: 25000,
      expectedAmountCents: 104000,
      countedAmountCents: 103500,
      charactersPerLine: 32,
      payments: [
        { method: "pix", amountCents: 55000 },
        { method: "cash", amountCents: 24000 },
      ],
    });

    expect(rendered).toContain("RESUMO DE CAIXA");
    expect(rendered).toContain("Operador: Caixa 01");
    expect(rendered).toContain("Pix");
    expect(rendered).toContain("Diferenca");
    expect(rendered).toContain("Fechamento gerencial");
  });

  it("renders a payment receipt with the same document standard", () => {
    const rendered = renderPaymentReceipt({
      tenantName: "Bar Aurora",
      establishmentDocument: "12.345.678/0001-90",
      branchName: "Centro",
      address: "Rua Exemplo, 100",
      orderCode: "M03-01",
      tableCode: "M03",
      operatorName: "Caixa 01",
      items: [{ name: "Burger Classico", quantity: "2", unitPriceCents: 3200, totalCents: 6400 }],
      subtotalCents: 6400,
      discountCents: 400,
      serviceChargeCents: 600,
      totalCents: 6600,
      payments: [
        { method: "pix_manual", amountCents: 3000 },
        { method: "cash", amountCents: 3600 },
      ],
      paidAt: "2026-07-03T22:00:00.000Z",
      charactersPerLine: 32,
    });

    expect(rendered).toContain("COMPROVANTE");
    expect(rendered).toContain("CNPJ/CPF: 12.345.678/0001-90");
    expect(rendered).toContain("Unidade: Centro");
    expect(rendered).toContain("FISCAL");
    expect(rendered).toContain("Emitido por GiroMesa");
    expect(rendered).toContain("2x Burger Classico");
    expect(rendered).toContain("Unitario");
    expect(rendered).toContain("Subtotal");
    expect(rendered).toContain("Desconto");
    expect(rendered).toContain("Servico");
    expect(rendered).toContain("Total");
    expect(rendered).toContain("Pix manual");
    expect(rendered).toContain("Dinheiro");
    expect(rendered).toContain("Via caixa");
  });
});
