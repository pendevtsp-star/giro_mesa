import type {
  AppStatus,
  HistoryFilter,
  OperatorProfile,
  RealtimeStatus,
} from "../../features/dashboard/dashboard-types";
import {
  type AuditEvent,
  type DiningTable,
  type FiscalDocument,
  formatMoney,
  type KdsTicket,
  type OutboxEvent,
  type PrinterConnectorConfig,
  type PrintJob,
  type Product,
  type QrPendingOrder,
  type TableHistoryEvent,
} from "../giromesa-api";

export function readStatusTitle(status: AppStatus) {
  if (status === "ready") {
    return "Operação conectada";
  }
  if (status === "loading") {
    return "Carregando sessão";
  }
  if (status === "unauthenticated") {
    return "Demo aguardando acesso";
  }
  return "Operação temporariamente indisponível";
}

export function readOperatorProfile(permissions: string[]): OperatorProfile {
  const canManageTenant = permissions.includes("tenant:manage");
  const canReadReports = permissions.includes("reports:read");
  const canManageCash = permissions.includes("cash:manage");
  const canOperatePos = permissions.includes("pos:operate");
  const canManageInventory = permissions.includes("inventory:manage");

  if (canManageTenant || canReadReports) {
    return {
      kicker: "Perfil recomendado",
      title: "Dono ou gerente",
      description: "Priorize relatórios, equipe, configurações e indicadores do turno.",
      actions: [
        { label: "Ver relatórios", href: "/app/reports" },
        { label: "Equipe", href: "/app/team" },
        { label: "Personalizar", href: "/app/settings/branding" },
      ],
    };
  }

  if (canManageCash) {
    return {
      kicker: "Perfil recomendado",
      title: "Caixa",
      description: "Acompanhe pagamentos, pré-contas, fechamento e pendências fiscais.",
      actions: [
        { label: "Fechar turno", href: "/app#caixa" },
        { label: "Relatórios", href: "/app/reports" },
      ],
    };
  }

  if (canOperatePos) {
    return {
      kicker: "Perfil recomendado",
      title: "Garçom",
      description: "Use a tela mobile para abrir mesa, lançar itens e enviar para a cozinha.",
      actions: [
        { label: "Modo garçom", href: "/app/waiter" },
        { label: "QR mesa M03", href: "/q/M03" },
      ],
    };
  }

  if (canManageInventory) {
    return {
      kicker: "Perfil recomendado",
      title: "Estoque",
      description: "Revise alertas, ficha tecnica e movimentos auditados.",
      actions: [{ label: "Ver estoque", href: "/app#estoque" }],
    };
  }

  return {
    kicker: "Perfil recomendado",
    title: "Operação",
    description: "Entre com uma conta do estabelecimento para carregar atalhos por permissão.",
    actions: [{ label: "Entrar", href: "/login" }],
  };
}

export function readCategoryLabel(product: Product) {
  if (product.name.toLowerCase().includes("chopp") || product.name.toLowerCase().includes("soda")) {
    return "Bebidas";
  }
  if (product.name.toLowerCase().includes("pizza")) {
    return "Pizzas";
  }
  if (product.name.toLowerCase().includes("brownie")) {
    return "Sobremesas";
  }
  return "Hamburgueres";
}

export function readPrepTime(name: string) {
  if (name.toLowerCase().includes("chopp") || name.toLowerCase().includes("soda")) {
    return "2 min";
  }
  if (name.toLowerCase().includes("pizza")) {
    return "18 min";
  }
  if (name.toLowerCase().includes("brownie")) {
    return "7 min";
  }
  return "12 min";
}

export function readQuantity(quantity: string) {
  return `${Number(quantity).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}x`;
}

export function readTableDetail(table: DiningTable) {
  const labels: Record<string, string> = {
    free: "Livre",
    occupied: "Ocupada",
    preparing: "Em preparo",
    waiting_payment: "Pagamento",
    reserved: "Reserva",
    served: "Servida",
    order_sent: "Cozinha",
    waiting_order: "Aguardando",
    blocked: "Bloqueada",
  };
  return labels[table.status] ?? table.status;
}

export function readQrOrderLabel(order: QrPendingOrder) {
  if (order.tableCode) {
    return `Mesa ${order.tableCode}`;
  }
  if (order.tableName) {
    return order.tableName;
  }
  return `Pedido ${order.id.slice(0, 8)}`;
}

export function readQrOrderSummary(order: QrPendingOrder) {
  if (order.items.length === 0) {
    return "Sem itens carregados";
  }

  return order.items
    .slice(0, 3)
    .map((item) => `${Number(item.quantity).toLocaleString("pt-BR")}x ${item.nameSnapshot}`)
    .join(", ");
}

export function readRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "agora";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return "agora";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function readHistoryActionLabel(action: string) {
  const labels: Record<string, string> = {
    "qr.order_created": "Pedido QR recebido",
    "qr.call-waiter": "Garçom chamado",
    "qr.pre-bill": "Pré-conta solicitada",
    "qr_order.item_updated": "Pedido QR revisado",
    "qr_order.item_canceled": "Item QR cancelado",
    "qr_order.rejected": "Pedido QR recusado",
    "order.sent_to_kitchen": "Enviado ao KDS",
    "payment.confirmed": "Pagamento confirmado",
    "order.closed": "Conta fechada",
  };
  return labels[action] ?? action;
}

export function readHistoryDetail(event: TableHistoryEvent) {
  const metadata = event.metadata ?? {};
  if (event.action === "qr.order_created") {
    return `${readMetadataValue(metadata, "itemCount", "Pedido")} item(ns) enviados pelo cliente.`;
  }
  if (event.action === "qr_order.item_updated") {
    return `${readMetadataValue(metadata, "name", "Item")} ajustado para ${readMetadataValue(
      metadata,
      "quantity",
      "nova quantidade",
    )}.`;
  }
  if (event.action === "qr_order.item_canceled") {
    return `${readMetadataValue(metadata, "name", "Item")} cancelado. ${readMetadataValue(
      metadata,
      "reason",
      "Motivo operacional registrado.",
    )}`;
  }
  if (event.action === "qr_order.rejected") {
    return String(metadata.reason ?? "Motivo operacional registrado.");
  }
  if (event.action === "order.sent_to_kitchen") {
    return `${readMetadataValue(metadata, "ticketsCreated", "0")} ticket(s) gerados.`;
  }
  if (event.action === "payment.confirmed") {
    const amountCents = readMetadataNumber(metadata, "amountCents");
    const method = readMetadataValue(metadata, "method", "pagamento manual");
    const orderStatus = readMetadataValue(metadata, "orderStatus", "status atualizado");
    return `${formatMoney(amountCents)} confirmado via ${method}. Pedido ficou como ${orderStatus}.`;
  }
  if (event.action === "order.closed") {
    const totalCents = readMetadataNumber(metadata, "totalCents");
    const movements = readMetadataValue(metadata, "stockMovementsCreated", "0");
    return `Conta fechada em ${formatMoney(totalCents)} com ${movements} baixa(s) de estoque.`;
  }
  if (typeof metadata.message === "string" && metadata.message.length > 0) {
    return metadata.message;
  }
  return "Evento registrado na auditoria.";
}

export function readOutboxStatus(event: OutboxEvent) {
  if (event.status === "failed" && event.attempts > 0) {
    return `erro ${event.attempts}x`;
  }
  return event.status;
}

export function readOutboxTone(status: string): "neutral" | "good" | "warn" | "danger" | "info" {
  if (status === "processed") {
    return "good";
  }
  if (status === "failed" || status === "error") {
    return "danger";
  }
  if (status === "pending") {
    return "warn";
  }
  return "neutral";
}

export function readOutboxPayloadSummary(event: OutboxEvent) {
  if (event.errorMessage) {
    return event.errorMessage;
  }

  const payload = event.payload ?? {};
  const orderId =
    typeof payload.orderId === "string" ? `Pedido ${payload.orderId.slice(0, 8)}` : "";
  const amount =
    typeof payload.amountCents === "number" ? formatMoney(payload.amountCents) : undefined;
  const branchId =
    typeof payload.branchId === "string" ? `Filial ${payload.branchId.slice(0, 8)}` : "";
  return [orderId, amount, branchId].filter(Boolean).join(" - ") || "Evento operacional.";
}

export function readAuditOperator(event: AuditEvent) {
  if (event.userName) {
    return event.userName;
  }
  if (event.userEmail) {
    return event.userEmail;
  }
  return "sistema";
}

export function readAuditSummary(event: AuditEvent) {
  const metadata = event.metadata ?? {};
  if (event.action === "role.updated") {
    return `Cargo ${readMetadataValue(metadata, "code", event.entityId ?? "selecionado")} atualizado.`;
  }
  if (event.action === "invitation.created") {
    return `Convite enviado para ${readMetadataValue(metadata, "email", "novo usuario")}.`;
  }
  if (event.action === "user.role_assigned") {
    return `Cargo aplicado ao usuario ${readMetadataValue(metadata, "email", "selecionado")}.`;
  }
  if (event.action === "payment.confirmed") {
    return `Pagamento auditado em ${formatMoney(readMetadataNumber(metadata, "amountCents"))}.`;
  }
  if (event.action === "order.closed") {
    return `Conta fechada em ${formatMoney(readMetadataNumber(metadata, "totalCents"))}.`;
  }
  return `${event.entityType} atualizado.`;
}

export function readHistoryOperator(event: TableHistoryEvent) {
  if (event.userName) {
    return event.userName;
  }
  if (event.userEmail) {
    return event.userEmail;
  }
  return "Cliente/QR";
}

export function isHistoryEventInFilter(event: TableHistoryEvent, filter: HistoryFilter): boolean {
  const isQrEvent = event.action.startsWith("qr") || event.action.startsWith("qr_order");
  const isKdsEvent = event.action.includes("kds") || event.action === "order.sent_to_kitchen";
  const isPaymentEvent = event.action.includes("payment") || event.action.includes("cash");

  if (filter === "all") {
    return true;
  }
  if (filter === "qr") {
    return isQrEvent;
  }
  if (filter === "kds") {
    return isKdsEvent;
  }
  if (filter === "payments") {
    return isPaymentEvent;
  }
  return !isQrEvent && !isPaymentEvent;
}

export function isHistoryEventMatchingQuery(event: TableHistoryEvent, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    readHistoryActionLabel(event.action),
    readHistoryDetail(event),
    readHistoryOperator(event),
    event.action,
    event.entityType,
    event.entityId ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function readRealtimeStatus(status: RealtimeStatus) {
  const labels: Record<RealtimeStatus, string> = {
    offline: "tempo real offline",
    connecting: "tempo real conectando",
    live: "tempo real ativo",
  };
  return labels[status];
}

export function readMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  const value = metadata[key];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function playQrNotification() {
  try {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  } catch {
    // Browsers may block audio until user interaction; the visual alert remains available.
  }
}

export function readTicketCode(ticket: KdsTicket) {
  const tableId = ticket.payload.tableId;
  return typeof tableId === "string" && tableId.length > 0 ? tableId : ticket.orderId.slice(0, 8);
}

export function readTicketSummary(ticket: KdsTicket) {
  const summary = ticket.payload.summary;
  if (typeof summary === "string") {
    return summary;
  }
  const source = ticket.payload.source;
  return typeof source === "string" ? source : ticket.orderChannel;
}

export function readTicketTone(status: string) {
  if (status === "ready") {
    return "good";
  }
  if (status === "waiting_payment") {
    return "warn";
  }
  return "neutral";
}

export function readFiscalTone(status: string) {
  if (status === "authorized") {
    return "good";
  }
  if (status === "pending" || status === "contingency") {
    return "warn";
  }
  if (status === "rejected" || status === "error") {
    return "danger";
  }
  return "neutral";
}

export function readFiscalBadgeTone(documents: FiscalDocument[]) {
  if (documents.some((document) => document.status === "rejected" || document.status === "error")) {
    return "danger";
  }
  if (documents.some((document) => document.status === "pending")) {
    return "warn";
  }
  if (documents.some((document) => document.status === "authorized")) {
    return "good";
  }
  return "neutral";
}

export function readFiscalSummary(documents: FiscalDocument[]) {
  if (documents.length === 0) {
    return "mock pronto";
  }
  const pending = documents.filter((document) => document.status === "pending").length;
  if (pending > 0) {
    return `${pending} pendente(s)`;
  }
  return `${documents.length} documento(s)`;
}

export function readFiscalStatus(status: string) {
  const labels: Record<string, string> = {
    not_required: "nao exigido",
    pending: "pendente",
    authorized: "autorizado",
    rejected: "rejeitado",
    canceled: "cancelado",
    contingency: "contingencia",
    error: "erro",
  };
  return labels[status] ?? status;
}

export function readPrintBadgeTone(jobs: PrintJob[]) {
  if (jobs.some((job) => job.status === "failed")) {
    return "danger";
  }
  if (jobs.some((job) => job.status === "pending" || job.status === "printing")) {
    return "warn";
  }
  if (jobs.some((job) => job.status === "printed")) {
    return "good";
  }
  return "neutral";
}

export function readPrintSummary(jobs: PrintJob[]) {
  const pending = jobs.filter((job) => job.status === "pending").length;
  if (pending > 0) {
    return `${pending} na fila`;
  }
  return jobs.length > 0 ? `${jobs.length} job(s)` : "sem fila";
}

export function readPrintTone(status: string) {
  if (status === "printed") {
    return "good";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "pending" || status === "printing") {
    return "warn";
  }
  return "neutral";
}

export function readPrintStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "pendente",
    printing: "imprimindo",
    printed: "impresso",
    failed: "falhou",
    canceled: "cancelado",
  };
  return labels[status] ?? status;
}

export function readPrintKind(kind: string) {
  const labels: Record<string, string> = {
    kitchen_ticket: "Comanda cozinha",
    bar_ticket: "Comanda bar",
    bill_preview: "Conferencia",
    cash_summary: "Resumo caixa",
    payment_receipt: "Comprovante",
    fiscal_danfe: "DANFE",
  };
  return labels[kind] ?? kind;
}

export function readConnectorLastSeen(value?: string | null) {
  if (!value) {
    return "sem heartbeat";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "data invalida";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readConnectorHeartbeatValue(config: PrinterConnectorConfig, key: string) {
  const value = config.heartbeat?.[key];
  return typeof value === "string" && value.length > 0 ? value : "-";
}

export function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((entry) => entry !== value);
}
