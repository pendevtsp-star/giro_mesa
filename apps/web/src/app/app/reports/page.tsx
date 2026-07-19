"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Download,
  FileText,
  Filter,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type AuditEvent,
  type CashSessionSummary,
  type FinancialReport,
  type FiscalDocument,
  formatMoney,
  getCashSessionSummary,
  getFinancialReport,
  getProductSalesReport,
  getSession,
  getTenantBranding,
  type InventorySummaryItem,
  listAuditEvents,
  listFiscalDocuments,
  listInventorySummary,
  type ProductSalesReport,
  type TenantBranding,
} from "../../../lib/giromesa-api";

const demoSummary: CashSessionSummary = {
  branchId: "demo",
  session: {
    id: "demo-session",
    status: "open",
    openingAmountCents: 25000,
    expectedAmountCents: 219480,
    countedAmountCents: null,
    differenceCents: null,
    openedAt: new Date().toISOString(),
    closedAt: null,
  },
  payments: {
    totalCents: 194480,
    count: 38,
    byMethod: { pix: 82400, credit_card: 71380, debit_card: 28700, cash: 12000 },
  },
  movements: [],
  openOrders: { count: 6, totalCents: 48600 },
};

const fallbackBranding: TenantBranding = {
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

function methodLabel(method: string) {
  const labels: Record<string, string> = {
    pix: "Pix",
    cash: "Dinheiro",
    credit_card: "Crédito",
    debit_card: "Débito",
  };
  return labels[method] ?? method;
}

function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    pos: "PDV",
    table: "Mesa",
    qr: "QR",
    delivery: "Delivery",
    club_whisky: "Dose Club",
  };
  return labels[channel] ?? channel;
}

const reportPeriods = [
  ["today", "Hoje"],
  ["week", "7 dias"],
  ["month", "30 dias"],
  ["shift", "Turno atual"],
  ["custom", "Período"],
] as const;

function reportPeriodLabel(period: "today" | "week" | "month" | "shift" | "custom") {
  return reportPeriods.find(([value]) => value === period)?.[1] ?? period;
}

export default function ReportsPage() {
  const [reportView, setReportView] = useState<"overview" | "products">("overview");
  const [summary, setSummary] = useState<CashSessionSummary>(demoSummary);
  const [fiscalDocs, setFiscalDocs] = useState<FiscalDocument[]>([]);
  const [inventory, setInventory] = useState<InventorySummaryItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [branding, setBranding] = useState<TenantBranding>(fallbackBranding);
  const [reportDre, setReportDre] = useState({
    grossRevenueCents: demoSummary.payments.totalCents,
    estimatedCostsCents: Math.round(demoSummary.payments.totalCents * 0.32),
    operationalMarginCents:
      demoSummary.payments.totalCents - Math.round(demoSummary.payments.totalCents * 0.32),
    operationalMarginPercent: 68,
  });
  const [status, setStatus] = useState("demo");
  const [financialCommercial, setFinancialCommercial] = useState<
    NonNullable<FinancialReport["commercial"]>
  >({
    averageTicketCents: demoSummary.payments.totalCents / Math.max(1, demoSummary.payments.count),
    openOrdersExposureCents: demoSummary.openOrders.totalCents,
    receivedVsOpenRatio: 4,
    previousTotalCents: 0,
    previousCount: 0,
    deltaCents: demoSummary.payments.totalCents,
    deltaPercent: null,
    previousDateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    previousDateTo: new Date().toISOString(),
    closeReadiness: "monitor",
  });
  const [reportChannels, setReportChannels] = useState<NonNullable<FinancialReport["channels"]>>(
    [],
  );
  const [reportOperators, setReportOperators] = useState<NonNullable<FinancialReport["operators"]>>(
    [],
  );
  const [cashSessions, setCashSessions] = useState<NonNullable<FinancialReport["cashSessions"]>>(
    [],
  );
  const [cashManagement, setCashManagement] = useState<
    NonNullable<FinancialReport["cashManagement"]>
  >({
    sessionsOpen: 1,
    sessionsClosed: 0,
    balancedSessions: 0,
    divergentSessions: 0,
    totalDifferenceCents: 0,
    averageDifferenceCents: 0,
    conferenceRatePercent: 0,
  });
  const [cashSessionFilter, setCashSessionFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [varianceFilter, setVarianceFilter] = useState<"all" | "divergent" | "balanced">("all");
  const [cashSessionStatusFilter, setCashSessionStatusFilter] = useState<
    "all" | "open" | "closed" | "reconciled" | "disputed"
  >("all");
  const [period, setPeriod] = useState<"today" | "week" | "month" | "shift" | "custom">("today");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [closeReadiness, setCloseReadiness] = useState<"ready" | "monitor" | "attention">(
    "monitor",
  );
  const [productSales, setProductSales] = useState<ProductSalesReport>({
    branchId: "demo",
    period: "today",
    dateFrom: new Date().toISOString(),
    dateTo: null,
    totalCents: 0,
    products: [],
  });

  useEffect(() => {
    async function load() {
      try {
        const session = await getSession();
        if (!session.branchId) {
          return;
        }
        const reportInput = {
          branchId: session.branchId,
          period,
          ...(period === "custom"
            ? {
                dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
                dateTo: new Date(`${dateTo}T23:59:59`).toISOString(),
              }
            : {}),
          ...(cashSessionFilter !== "all" ? { cashSessionId: cashSessionFilter } : {}),
          ...(paymentMethodFilter !== "all" ? { paymentMethod: paymentMethodFilter } : {}),
          variance: varianceFilter,
          ...(cashSessionStatusFilter !== "all"
            ? { cashSessionStatus: cashSessionStatusFilter }
            : {}),
        };
        const [
          cashSummary,
          financialReport,
          documents,
          inventoryItems,
          auditEvents,
          tenantBranding,
          productReport,
        ] = await Promise.all([
          getCashSessionSummary(session.branchId),
          getFinancialReport(reportInput),
          listFiscalDocuments(session.branchId),
          listInventorySummary(session.branchId),
          listAuditEvents(),
          getTenantBranding(),
          getProductSalesReport({
            branchId: session.branchId,
            period,
            ...(period === "custom"
              ? {
                  dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
                  dateTo: new Date(`${dateTo}T23:59:59`).toISOString(),
                }
              : {}),
          }),
        ]);
        setSummary({
          ...cashSummary,
          payments: financialReport.payments,
          openOrders: financialReport.openOrders,
        });
        setReportDre({
          ...financialReport.dre,
          operationalMarginPercent: financialReport.dre.operationalMarginPercent ?? 0,
        });
        setBranding(tenantBranding);
        setProductSales(productReport);
        setFinancialCommercial(
          financialReport.commercial ?? {
            averageTicketCents: financialReport.payments.averageTicketCents ?? 0,
            openOrdersExposureCents: financialReport.openOrders.totalCents,
            receivedVsOpenRatio: null,
            previousTotalCents: 0,
            previousCount: 0,
            deltaCents: financialReport.payments.totalCents,
            deltaPercent: null,
            previousDateFrom: financialReport.dateFrom,
            previousDateTo: financialReport.dateTo ?? null,
            closeReadiness: "monitor",
          },
        );
        setReportChannels(financialReport.channels ?? []);
        setReportOperators(financialReport.operators ?? []);
        setCashSessions(financialReport.cashSessions ?? []);
        setCashManagement(
          financialReport.cashManagement ?? {
            sessionsOpen: 0,
            sessionsClosed: 0,
            balancedSessions: 0,
            divergentSessions: 0,
            totalDifferenceCents: 0,
            averageDifferenceCents: 0,
            conferenceRatePercent: 0,
          },
        );
        setCloseReadiness(financialReport.commercial?.closeReadiness ?? "monitor");
        setFiscalDocs(documents);
        setInventory(inventoryItems);
        setAudit(auditEvents.slice(0, 8));
        setStatus("online");
      } catch {
        setStatus("demo");
      }
    }

    void load();
  }, [
    period,
    dateFrom,
    dateTo,
    cashSessionFilter,
    paymentMethodFilter,
    varianceFilter,
    cashSessionStatusFilter,
  ]);

  const paymentEntries = Object.entries(summary.payments.byMethod).sort((a, b) => b[1] - a[1]);
  const fiscalPending = fiscalDocs.filter(
    (doc) => !["authorized", "cancelled"].includes(doc.status),
  );
  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.minQuantity));
  const avgTicket = summary.payments.count
    ? Math.round(summary.payments.totalCents / summary.payments.count)
    : 0;
  const estimatedCostsCents = reportDre.estimatedCostsCents;
  const serviceMarginCents = reportDre.operationalMarginCents;
  const brandInitial = branding.displayName.slice(0, 1).toUpperCase() || "G";
  const dreRows = [
    ["Receita bruta", summary.payments.totalCents],
    ["CMV estimado", -estimatedCostsCents],
    ["Margem operacional", serviceMarginCents],
    ["Em aberto", summary.openOrders.totalCents],
  ] as const;
  const largestPayment = useMemo(
    () => Math.max(1, ...paymentEntries.map(([, value]) => value)),
    [paymentEntries],
  );
  const paymentMix =
    summary.payments.mix ??
    paymentEntries.map(([method, value]) => ({
      method,
      totalCents: value,
      count: 0,
      sharePercent:
        summary.payments.totalCents > 0
          ? Number(((value / summary.payments.totalCents) * 100).toFixed(1))
          : 0,
    }));
  const filteredPaymentMix = paymentMix;
  const visibleCashSessions = cashSessions;
  const executiveAlerts = [
    cashManagement.divergentSessions > 0
      ? `${cashManagement.divergentSessions} caixa(s) com diferença no período.`
      : "Nenhuma divergência de caixa encontrada nesta janela.",
    fiscalPending.length > 0
      ? `${fiscalPending.length} documento(s) fiscal(is) exigem ação administrativa.`
      : "Sem pendências fiscais relevantes agora.",
    lowStock.length > 0
      ? `${lowStock.length} item(ns) abaixo do mínimo podem pressionar a operação.`
      : "Sem risco crítico de estoque no recorte atual.",
  ];
  const largestChannelTotal = useMemo(
    () => Math.max(1, ...reportChannels.map((entry) => entry.totalCents)),
    [reportChannels],
  );
  const topOperator = reportOperators[0] ?? null;

  function handleExportCsv() {
    const rows = [
      ["periodo", period],
      ["receita_recebida", summary.payments.totalCents],
      ["pagamentos", summary.payments.count],
      ["ticket_medio", avgTicket],
      ["pedidos_abertos", summary.openOrders.count],
      ["valor_em_aberto", summary.openOrders.totalCents],
      ["margem_operacional", serviceMarginCents],
      ["margem_percentual", reportDre.operationalMarginPercent],
      ["prontidao_fechamento", closeReadiness],
      ["comparativo_anterior_total", financialCommercial.previousTotalCents],
      ["comparativo_delta", financialCommercial.deltaCents],
      ["comparativo_delta_percentual", financialCommercial.deltaPercent ?? ""],
      ...paymentMix.map((entry) => [
        `metodo_${entry.method}`,
        entry.totalCents,
        `${entry.sharePercent}%`,
      ]),
      ...reportChannels.map((entry) => [
        `canal_${entry.channel}`,
        entry.totalCents,
        `${entry.sharePercent}%`,
      ]),
    ];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `giromesa-relatorio-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCashExecutiveCsv() {
    const rows = [
      ["caixas_fechados", cashManagement.sessionsClosed],
      ["caixas_abertos", cashManagement.sessionsOpen],
      ["caixas_conferidos", cashManagement.balancedSessions],
      ["caixas_com_diferenca", cashManagement.divergentSessions],
      ["diferenca_total", cashManagement.totalDifferenceCents],
      ["diferenca_media", cashManagement.averageDifferenceCents],
      ["taxa_conferencia", `${cashManagement.conferenceRatePercent}%`],
      ...cashSessions.map((session) => [
        session.operatorName,
        session.status,
        session.openingAmountCents,
        session.expectedAmountCents,
        session.countedAmountCents ?? "",
        session.differenceCents ?? "",
        session.paymentsTotalCents,
        new Date(session.openedAt).toLocaleString("pt-BR"),
      ]),
    ];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `giromesa-fechamento-caixa-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCashExecutivePdf() {
    const popup = window.open("", "_blank", "width=980,height=760");
    if (!popup) {
      return;
    }

    const rows = cashSessions
      .map(
        (session) => `
          <tr>
            <td>${escapeHtml(session.operatorName)}</td>
            <td>${escapeHtml(session.status)}</td>
            <td>${escapeHtml(formatMoney(session.expectedAmountCents))}</td>
            <td>${escapeHtml(
              session.countedAmountCents !== null ? formatMoney(session.countedAmountCents) : "-",
            )}</td>
            <td>${escapeHtml(
              session.differenceCents !== null ? formatMoney(session.differenceCents) : "-",
            )}</td>
            <td>${escapeHtml(formatMoney(session.paymentsTotalCents))}</td>
          </tr>`,
      )
      .join("");
    const html = renderBrandedPrintDocument({
      branding,
      documentLabel: "Fechamento gerencial",
      title: "Fechamento por caixa",
      subtitle:
        "Visão executiva do desempenho dos caixas do período, com conferências, divergências e total recebido por operador.",
      metadata: [
        { label: "Período", value: reportPeriodLabel(period) },
        { label: "Ambiente", value: branding.displayName },
        { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
      ],
      metrics: [
        { label: "Caixas fechados", value: String(cashManagement.sessionsClosed) },
        { label: "Divergência total", value: formatMoney(cashManagement.totalDifferenceCents) },
        {
          label: "Taxa de conferência",
          value: `${cashManagement.conferenceRatePercent.toFixed(1)}%`,
        },
        { label: "Caixas com diferença", value: String(cashManagement.divergentSessions) },
      ],
      bodyHtml: `
        <section class="section">
          <h2>Resumo operacional</h2>
          <table>
            <thead>
              <tr>
                <th>Operador</th>
                <th>Status</th>
                <th>Esperado</th>
                <th>Contado</th>
                <th>Diferença</th>
                <th>Recebido</th>
              </tr>
            </thead>
            <tbody>${rows || "<tr><td colspan='6'>Sem sessões no período.</td></tr>"}</tbody>
          </table>
        </section>
      `,
      footerNote:
        "Relatório emitido pelo GiroMesa com identidade visual padronizada do estabelecimento para uso gerencial e auditoria interna.",
    });

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function handleExportExecutivePdf() {
    const popup = window.open("", "_blank", "width=1180,height=860");
    if (!popup) {
      return;
    }

    const paymentRows = filteredPaymentMix
      .map(
        (entry) => `
          <tr>
            <td>${escapeHtml(methodLabel(entry.method))}</td>
            <td>${escapeHtml(formatMoney(entry.totalCents))}</td>
            <td>${escapeHtml(`${entry.sharePercent}%`)}</td>
            <td>${escapeHtml(String(entry.count))}</td>
          </tr>`,
      )
      .join("");
    const operatorRows = visibleCashSessions
      .map(
        (session) => `
          <tr>
            <td>${escapeHtml(session.operatorName)}</td>
            <td>${escapeHtml(session.status)}</td>
            <td>${escapeHtml(formatMoney(session.paymentsTotalCents))}</td>
            <td>${escapeHtml(
              session.differenceCents !== null ? formatMoney(session.differenceCents) : "-",
            )}</td>
          </tr>`,
      )
      .join("");

    const html = renderBrandedPrintDocument({
      branding,
      documentLabel: "Relatório executivo",
      title: "Panorama financeiro do período",
      subtitle:
        "Leitura consolidada para dono, gerente e fechamento administrativo com filtros gerenciais aplicados.",
      metadata: [
        { label: "Período", value: reportPeriodLabel(period) },
        { label: "Caixa", value: cashSessionFilter === "all" ? "Todos" : "Filtrado" },
        {
          label: "Método",
          value: paymentMethodFilter === "all" ? "Todos" : methodLabel(paymentMethodFilter),
        },
      ],
      metrics: [
        { label: "Receita", value: formatMoney(summary.payments.totalCents) },
        {
          label: "Ticket médio",
          value: formatMoney(summary.payments.averageTicketCents ?? avgTicket),
        },
        { label: "Margem", value: `${reportDre.operationalMarginPercent.toFixed(1)}%` },
        { label: "Fechamento", value: closeReadiness },
      ],
      bodyHtml: `
        <section class="section">
          <h2>Alertas executivos</h2>
          <ul>${executiveAlerts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        <section class="section">
          <h2>Mix de pagamentos</h2>
          <table>
            <thead><tr><th>Método</th><th>Total</th><th>Share</th><th>Pagamentos</th></tr></thead>
            <tbody>${paymentRows || "<tr><td colspan='4'>Sem dados.</td></tr>"}</tbody>
          </table>
        </section>
        <section class="section">
          <h2>Caixas e operadores</h2>
          <table>
            <thead><tr><th>Operador</th><th>Status</th><th>Recebido</th><th>Diferença</th></tr></thead>
            <tbody>${operatorRows || "<tr><td colspan='4'>Sem sessões no recorte atual.</td></tr>"}</tbody>
          </table>
        </section>
      `,
      footerNote:
        "Relatório gerado pelo GiroMesa para leitura gerencial do estabelecimento. Não substitui conciliação contábil oficial.",
    });

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <main
      className="report-page"
      data-theme={branding.themeMode}
      data-accent={branding.accentPreset}
    >
      <header className="report-header">
        <div>
          <div className="report-brand-lockup">
            <span
              className={branding.logoUrl ? "tenant-logo cover" : "tenant-avatar"}
              style={branding.logoUrl ? { backgroundImage: `url(${branding.logoUrl})` } : undefined}
            >
              {branding.logoUrl ? "" : brandInitial}
            </span>
            <strong>{branding.displayName}</strong>
          </div>
          <span className="section-kicker">
            <BarChart3 size={16} /> Gestão financeira
          </span>
          <h1>Relatórios do turno</h1>
          <p>
            Caixa, formas de pagamento, pendências fiscais e sinais operacionais em uma visão
            executiva.
          </p>
        </div>
        <div className="toolbar">
          <a className="button secondary" href="/app">
            Voltar ao painel
          </a>
          <details className="report-export-menu">
            <summary className="button primary">
              <Download size={17} /> Exportar
            </summary>
            <div>
              <button type="button" onClick={handleExportCsv}>
                Relatório em CSV
              </button>
              <button type="button" onClick={handleExportCashExecutiveCsv}>
                Fechamento de caixa em CSV
              </button>
              <button type="button" onClick={handleExportCashExecutivePdf}>
                Fechamento de caixa em PDF
              </button>
              <button type="button" onClick={handleExportExecutivePdf}>
                Resumo executivo em PDF
              </button>
            </div>
          </details>
        </div>
      </header>

      <section className="report-filters" aria-label="Filtros de relatório">
        <Filter size={18} />
        {reportPeriods.map(([value, label]) => (
          <button
            className={`filter ${period === value ? "selected" : ""}`}
            type="button"
            key={value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
        {period === "custom" ? (
          <div className="report-date-range">
            <input
              aria-label="Data inicial"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              aria-label="Data final"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        ) : null}
        <select
          aria-label="Filtrar por caixa"
          value={cashSessionFilter}
          onChange={(event) => setCashSessionFilter(event.target.value)}
        >
          <option value="all">Todas as conferências</option>
          {cashSessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.operatorName} - {new Date(session.openedAt).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por método"
          value={paymentMethodFilter}
          onChange={(event) => setPaymentMethodFilter(event.target.value)}
        >
          <option value="all">Todos os métodos</option>
          {paymentMix.map((entry) => (
            <option key={entry.method} value={entry.method}>
              {methodLabel(entry.method)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por conferência"
          value={varianceFilter}
          onChange={(event) =>
            setVarianceFilter(event.target.value as "all" | "divergent" | "balanced")
          }
        >
          <option value="all">Todos os caixas</option>
          <option value="divergent">Somente divergentes</option>
          <option value="balanced">Somente conferidos</option>
        </select>
        <select
          aria-label="Filtrar por status de caixa"
          value={cashSessionStatusFilter}
          onChange={(event) =>
            setCashSessionStatusFilter(
              event.target.value as "all" | "open" | "closed" | "reconciled" | "disputed",
            )
          }
        >
          <option value="all">Todos os status</option>
          <option value="open">Abertos</option>
          <option value="closed">Fechados</option>
          <option value="reconciled">Conferidos</option>
          <option value="disputed">Divergentes</option>
        </select>
      </section>

      <section className="report-view-switch" aria-label="Modo de relatório">
        <button
          className={reportView === "overview" ? "filter selected" : "filter"}
          type="button"
          onClick={() => setReportView("overview")}
        >
          Visão executiva
        </button>
        <button
          className={reportView === "products" ? "filter selected" : "filter"}
          type="button"
          onClick={() => setReportView("products")}
        >
          Produtos e vendas
        </button>
      </section>

      <section className="report-status">
        <span className={`gm-badge ${status === "online" ? "gm-badge-good" : "gm-badge-warn"}`}>
          {status}
        </span>
        <strong>Fechamento mais confiável com conciliação por turno.</strong>
        <span>
          {closeReadiness === "ready"
            ? "Sem pedidos em aberto relevantes para o fechamento."
            : closeReadiness === "attention"
              ? "Valor em aberto exige conferência antes de fechar."
              : "Monitore pedidos em aberto antes de encerrar o turno."}
        </span>
      </section>

      {reportView === "overview" ? (
        <>
          <section className="report-grid">
            <article className="report-card emphasis">
              <span>Receita recebida</span>
              <strong>{formatMoney(summary.payments.totalCents)}</strong>
              <small>{summary.payments.count} pagamentos registrados</small>
            </article>
            <article className="report-card">
              <span>Ticket médio</span>
              <strong>{formatMoney(summary.payments.averageTicketCents ?? avgTicket)}</strong>
              <small>Baseado nos pagamentos do turno</small>
            </article>
            <article className="report-card">
              <span>Pedidos abertos</span>
              <strong>{summary.openOrders.count}</strong>
              <small>{formatMoney(summary.openOrders.totalCents)} ainda em consumo</small>
            </article>
            <article className="report-card">
              <span>Caixa esperado</span>
              <strong>{formatMoney(summary.session?.expectedAmountCents ?? 0)}</strong>
              <small>Abertura + recebimentos manuais</small>
            </article>
            <article className="report-card">
              <span>Margem estimada</span>
              <strong>{reportDre.operationalMarginPercent.toFixed(1)}%</strong>
              <small>{formatMoney(serviceMarginCents)} após CMV inicial</small>
            </article>
            <article className="report-card">
              <span>Comparativo</span>
              <strong className={financialCommercial.deltaCents < 0 ? "danger-text" : ""}>
                {financialCommercial.deltaPercent === null
                  ? "Base nova"
                  : `${financialCommercial.deltaPercent > 0 ? "+" : ""}${financialCommercial.deltaPercent.toFixed(1)}%`}
              </strong>
              <small>Versus período anterior equivalente</small>
            </article>
            <article className="report-card">
              <span>Operador lider</span>
              <strong>{topOperator?.operatorName ?? "Sem caixa"}</strong>
              <small>
                {topOperator
                  ? `${formatMoney(topOperator.paymentsTotalCents)} em ${topOperator.cashSessionCount} caixa(s)`
                  : "Sem sessões no período"}
              </small>
            </article>
            <article className="report-card">
              <span>Conferência de caixa</span>
              <strong>{cashManagement.conferenceRatePercent.toFixed(1)}%</strong>
              <small>
                {cashManagement.balancedSessions}/{cashSessions.length || 0} caixas sem diferença
              </small>
            </article>
          </section>

          <section className="report-layout">
            <article className="panel report-comparison">
              <div className="panel-title">
                <AlertTriangle size={19} />
                <div>
                  <h2>Radar executivo</h2>
                  <p>Os sinais que merecem decisão gerencial neste fechamento.</p>
                </div>
              </div>
              <div className="status-list">
                {executiveAlerts.map((item) => (
                  <div className="status-row rich" key={item}>
                    <div>
                      <strong>Atenção operacional</strong>
                      <span>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel report-comparison">
              <div className="panel-title">
                <TrendingUp size={19} />
                <div>
                  <h2>Comparativo de período</h2>
                  <p>Leitura rápida do ritmo financeiro contra a janela anterior.</p>
                </div>
              </div>
              <div className="report-comparison-grid">
                <div>
                  <span>Período atual</span>
                  <strong>{formatMoney(summary.payments.totalCents)}</strong>
                  <small>{summary.payments.count} pagamentos</small>
                </div>
                <div>
                  <span>Período anterior</span>
                  <strong>{formatMoney(financialCommercial.previousTotalCents)}</strong>
                  <small>{financialCommercial.previousCount} pagamentos</small>
                </div>
                <div>
                  <span>Variação</span>
                  <strong className={financialCommercial.deltaCents < 0 ? "danger-text" : ""}>
                    {formatMoney(financialCommercial.deltaCents)}
                  </strong>
                  <small>
                    {financialCommercial.deltaPercent === null
                      ? "Sem base anterior relevante"
                      : `${financialCommercial.deltaPercent > 0 ? "+" : ""}${financialCommercial.deltaPercent.toFixed(1)}%`}
                  </small>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <CreditCard size={19} />
                <div>
                  <h2>Fechamento gerencial por caixa</h2>
                  <p>Leitura de divergência, conferência e volume por sessões.</p>
                </div>
              </div>
              <div className="report-comparison-grid">
                <div>
                  <span>Caixas fechados</span>
                  <strong>{cashManagement.sessionsClosed}</strong>
                  <small>{cashManagement.sessionsOpen} ainda aberto(s)</small>
                </div>
                <div>
                  <span>Divergência total</span>
                  <strong
                    className={cashManagement.totalDifferenceCents !== 0 ? "danger-text" : ""}
                  >
                    {formatMoney(cashManagement.totalDifferenceCents)}
                  </strong>
                  <small>{cashManagement.divergentSessions} caixa(s) com diferença</small>
                </div>
                <div>
                  <span>Diferença média</span>
                  <strong
                    className={cashManagement.averageDifferenceCents !== 0 ? "danger-text" : ""}
                  >
                    {formatMoney(cashManagement.averageDifferenceCents)}
                  </strong>
                  <small>Por sessão no período</small>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <CreditCard size={19} />
                <div>
                  <h2>Pagamentos por método</h2>
                  <p>Composição do turno atual.</p>
                </div>
              </div>
              <div className="payment-bars">
                {filteredPaymentMix.length ? (
                  filteredPaymentMix.map((entry) => (
                    <div className="payment-bar" key={entry.method}>
                      <div>
                        <strong>{methodLabel(entry.method)}</strong>
                        <span>
                          {formatMoney(entry.totalCents)} - {entry.sharePercent}%
                        </span>
                      </div>
                      <i
                        style={{
                          width: `${Math.max(8, (entry.totalCents / largestPayment) * 100)}%`,
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">Nenhum método corresponde ao filtro atual.</p>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <TrendingUp size={19} />
                <div>
                  <h2>DRE simples</h2>
                  <p>Leitura gerencial inicial, ainda sem contabilidade oficial.</p>
                </div>
                <span className="gm-badge gm-badge-info">
                  {reportDre.operationalMarginPercent.toFixed(1)}%
                </span>
              </div>
              <div className="report-dre">
                {dreRows.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong className={value < 0 ? "danger-text" : ""}>{formatMoney(value)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <FileText size={19} />
                <div>
                  <h2>Fiscal e estoque</h2>
                  <p>Pendências que podem travar rotina administrativa.</p>
                </div>
              </div>
              <div className="report-alerts">
                <div>
                  <AlertTriangle size={18} />
                  <strong>{fiscalPending.length}</strong>
                  <span>notas/cupons pendentes</span>
                </div>
                <div>
                  <Activity size={18} />
                  <strong>{lowStock.length}</strong>
                  <span>itens abaixo do mínimo</span>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <BarChart3 size={19} />
                <div>
                  <h2>Receita por canal</h2>
                  <p>Quanto cada frente de venda puxou do faturamento.</p>
                </div>
              </div>
              <div className="payment-bars">
                {reportChannels.length ? (
                  reportChannels.map((entry) => (
                    <div className="payment-bar" key={entry.channel}>
                      <div>
                        <strong>{channelLabel(entry.channel)}</strong>
                        <span>
                          {formatMoney(entry.totalCents)} - {entry.sharePercent}%
                        </span>
                      </div>
                      <i
                        style={{
                          width: `${Math.max(8, (entry.totalCents / largestChannelTotal) * 100)}%`,
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">Ainda sem dados por canal neste período.</p>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <Activity size={19} />
                <div>
                  <h2>Operadores e caixas</h2>
                  <p>Quem puxou receita e como cada caixa performou no período.</p>
                </div>
              </div>
              <div className="report-operator-grid">
                <div className="report-operator-summary">
                  {reportOperators.length ? (
                    reportOperators.map((operator) => (
                      <div className="status-row rich" key={operator.operatorId}>
                        <div>
                          <strong>{operator.operatorName}</strong>
                          <span>
                            {operator.cashSessionCount} caixa(s) - {operator.paymentsCount}{" "}
                            pagamento(s)
                          </span>
                        </div>
                        <small>{formatMoney(operator.paymentsTotalCents)}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">Sem operadores consolidados neste período.</p>
                  )}
                </div>
                <div className="report-cash-session-list">
                  {visibleCashSessions.length ? (
                    visibleCashSessions.map((session) => (
                      <div className="status-row rich" key={session.id}>
                        <div>
                          <strong>{session.operatorName}</strong>
                          <span>
                            {session.status} - aberto em{" "}
                            {new Date(session.openedAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <small>
                          {formatMoney(session.paymentsTotalCents)}
                          {session.differenceCents !== null
                            ? ` · dif ${formatMoney(session.differenceCents)}`
                            : ""}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">Nenhum caixa corresponde ao filtro atual.</p>
                  )}
                </div>
              </div>
            </article>

            <article className="panel report-ledger">
              <div className="panel-title">
                <Activity size={19} />
                <div>
                  <h2>Últimas movimentações</h2>
                  <p>Eventos auditáveis ligados a caixa e operação.</p>
                </div>
              </div>
              <div className="audit-list">
                {audit.length ? (
                  audit.map((event) => (
                    <div className="status-row rich" key={event.id}>
                      <div>
                        <strong>{event.action}</strong>
                        <span>
                          {event.entityType} - {event.userName ?? event.userEmail ?? "sistema"}
                        </span>
                      </div>
                      <small>{new Date(event.createdAt).toLocaleString("pt-BR")}</small>
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">
                    Sem eventos reais carregados. Entre no painel para ver auditoria.
                  </p>
                )}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="product-analytics panel">
          <div className="panel-title">
            <BarChart3 size={19} />
            <div>
              <h2>Desempenho por produto</h2>
              <p>Produtos vendidos, faturamento, participação no período e presença em comandas.</p>
            </div>
            <strong>{formatMoney(productSales.totalCents)}</strong>
          </div>
          <div className="product-analytics-head">
            <span>Produto</span>
            <span>Unidades</span>
            <span>Comandas</span>
            <span>Receita</span>
            <span>Participação</span>
          </div>
          <div className="product-analytics-list">
            {productSales.products.length ? (
              productSales.products.map((product) => (
                <div className="product-analytics-row" key={product.productId}>
                  <strong>{product.name}</strong>
                  <span>
                    {product.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  </span>
                  <span>{product.orderCount}</span>
                  <span>{formatMoney(product.revenueCents)}</span>
                  <span>
                    <i style={{ width: `${Math.max(4, product.sharePercent)}%` }} />
                    {product.sharePercent}%
                  </span>
                </div>
              ))
            ) : (
              <p className="muted-copy">Ainda não há itens vendidos no recorte escolhido.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
