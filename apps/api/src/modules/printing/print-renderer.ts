export type KitchenTicketLine = {
  name: string;
  quantity: string;
  notes?: string | null;
};

export type KitchenTicketInput = {
  tenantName?: string;
  stationName: string;
  orderCode: string;
  orderChannel: string;
  tableCode?: string | null;
  items: KitchenTicketLine[];
  createdAt: string;
  copies: number;
  charactersPerLine: number;
};

export type ReceiptLine = {
  name: string;
  quantity: string;
  totalCents: number;
};

export type PaymentLine = {
  method: string;
  amountCents: number;
};

export type BillPreviewInput = {
  tenantName?: string;
  orderCode: string;
  tableCode?: string | null;
  items: ReceiptLine[];
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  totalCents: number;
  createdAt: string;
  charactersPerLine: number;
};

export type CashSummaryInput = {
  tenantName?: string;
  operatorName?: string | null;
  openedAt: string;
  closedAt?: string | null;
  openingAmountCents: number;
  expectedAmountCents: number;
  countedAmountCents?: number | null;
  payments: PaymentLine[];
  charactersPerLine: number;
};

export type PaymentReceiptInput = {
  tenantName?: string;
  orderCode: string;
  tableCode?: string | null;
  operatorName?: string | null;
  paymentMethod: string;
  amountCents: number;
  paidAt: string;
  charactersPerLine: number;
};

export function renderKitchenTicket(input: KitchenTicketInput) {
  const width = Math.max(32, Math.min(input.charactersPerLine, 56));
  const lines: string[] = [];

  lines.push(center(input.tenantName ?? "GIROMESA", width));
  lines.push(center(input.stationName.toUpperCase(), width));
  lines.push("-".repeat(width));
  lines.push(`Pedido: ${input.orderCode}`);
  lines.push(`Origem: ${input.orderChannel}`);
  if (input.tableCode) {
    lines.push(`Mesa/Comanda: ${input.tableCode}`);
  }
  lines.push(`Criado: ${formatDate(input.createdAt)}`);
  lines.push("-".repeat(width));

  for (const item of input.items) {
    lines.push(...wrapLine(`${readQuantity(item.quantity)} ${item.name}`, width));
    if (item.notes) {
      lines.push(...wrapLine(`  obs: ${item.notes}`, width));
    }
  }

  lines.push("-".repeat(width));
  lines.push(`Vias: ${input.copies}`);
  lines.push("\n\n");

  return lines.join("\n");
}

export function renderBillPreview(input: BillPreviewInput) {
  const width = Math.max(32, Math.min(input.charactersPerLine, 56));
  const lines: string[] = [];

  pushDocumentHeader(lines, width, input.tenantName ?? "GIROMESA", "PRE-CONTA");
  lines.push(`Pedido: ${input.orderCode}`);
  if (input.tableCode) {
    lines.push(`Mesa/Comanda: ${input.tableCode}`);
  }
  lines.push(`Emitido: ${formatDate(input.createdAt)}`);
  lines.push("-".repeat(width));

  for (const item of input.items) {
    lines.push(...wrapLine(`${readQuantity(item.quantity)} ${item.name}`, width - 12));
    lines.push(rightMoney(item.totalCents, width));
  }

  lines.push("-".repeat(width));
  lines.push(labelMoney("Subtotal", input.subtotalCents, width));
  if (input.discountCents > 0) {
    lines.push(labelMoney("Desconto", -input.discountCents, width));
  }
  if (input.serviceChargeCents > 0) {
    lines.push(labelMoney("Servico", input.serviceChargeCents, width));
  }
  lines.push(labelMoney("Total", input.totalCents, width));
  lines.push(center("Documento sem valor fiscal", width));
  pushDocumentFooter(lines, width, "Via cliente");
  lines.push("\n\n");

  return lines.join("\n");
}

export function renderCashSummary(input: CashSummaryInput) {
  const width = Math.max(32, Math.min(input.charactersPerLine, 56));
  const lines: string[] = [];

  pushDocumentHeader(lines, width, input.tenantName ?? "GIROMESA", "RESUMO DE CAIXA");
  if (input.operatorName) {
    lines.push(`Operador: ${input.operatorName}`);
  }
  lines.push(`Abertura: ${formatDate(input.openedAt)}`);
  if (input.closedAt) {
    lines.push(`Fechamento: ${formatDate(input.closedAt)}`);
  }
  lines.push("-".repeat(width));
  lines.push(labelMoney("Fundo inicial", input.openingAmountCents, width));
  for (const payment of input.payments) {
    lines.push(labelMoney(readPaymentMethod(payment.method), payment.amountCents, width));
  }
  lines.push("-".repeat(width));
  lines.push(labelMoney("Esperado", input.expectedAmountCents, width));
  if (input.countedAmountCents !== null && input.countedAmountCents !== undefined) {
    lines.push(labelMoney("Contado", input.countedAmountCents, width));
    lines.push(
      labelMoney("Diferenca", input.countedAmountCents - input.expectedAmountCents, width),
    );
  }
  pushDocumentFooter(lines, width, "Fechamento gerencial");
  lines.push("\n\n");

  return lines.join("\n");
}

export function renderPaymentReceipt(input: PaymentReceiptInput) {
  const width = Math.max(32, Math.min(input.charactersPerLine, 56));
  const lines: string[] = [];

  pushDocumentHeader(lines, width, input.tenantName ?? "GIROMESA", "COMPROVANTE");
  lines.push(`Pedido: ${input.orderCode}`);
  if (input.tableCode) {
    lines.push(`Mesa/Comanda: ${input.tableCode}`);
  }
  if (input.operatorName) {
    lines.push(`Operador: ${input.operatorName}`);
  }
  lines.push(`Pagamento: ${readPaymentMethod(input.paymentMethod)}`);
  lines.push(`Emitido: ${formatDate(input.paidAt)}`);
  lines.push("-".repeat(width));
  lines.push(labelMoney("Valor pago", input.amountCents, width));
  pushDocumentFooter(lines, width, "Via caixa");
  lines.push("\n\n");

  return lines.join("\n");
}

function readQuantity(quantity: string) {
  return `${Number(quantity).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function labelMoney(label: string, cents: number, width: number) {
  const money = formatMoney(cents);
  const available = Math.max(1, width - money.length - 1);
  return `${label.slice(0, available).padEnd(available, " ")} ${money}`;
}

function rightMoney(cents: number, width: number) {
  return formatMoney(cents).padStart(width, " ");
}

function readPaymentMethod(method: string) {
  const labels: Record<string, string> = {
    cash: "Dinheiro",
    pix: "Pix",
    pix_manual: "Pix manual",
    credit_card: "Credito",
    debit_card: "Debito",
  };
  return labels[method] ?? method;
}

function pushDocumentHeader(lines: string[], width: number, tenantName: string, label: string) {
  lines.push(center(tenantName, width));
  lines.push(center(label, width));
  lines.push(center("Emitido por GiroMesa", width));
  lines.push("-".repeat(width));
}

function pushDocumentFooter(lines: string[], width: number, note: string) {
  lines.push("-".repeat(width));
  lines.push(center(note, width));
  lines.push(center("Padrao documental GiroMesa", width));
}

function center(value: string, width: number) {
  if (value.length >= width) {
    return value.slice(0, width);
  }
  const left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`;
}

function wrapLine(value: string, width: number) {
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word.length > width ? word.slice(0, width) : word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}
