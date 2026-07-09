"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Download,
  FileText,
  LifeBuoy,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatMoney,
  type ApiError,
  listPlatformTenants,
  type PlatformTenant,
} from "../../../lib/giromesa-api";

type SupportFilter = "all" | "queued" | "in_progress" | "waiting_customer" | "resolved";

const demoTenants: PlatformTenant[] = [
  {
    id: "demo-1",
    name: "Bar Aurora",
    slug: "bar-aurora-demo",
    document: null,
    status: "active",
    createdAt: new Date().toISOString(),
    planCode: "professional",
    planName: "Professional",
    priceCents: 29900,
    subscriptionStatus: "active",
    currentPeriodEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    branchCount: 1,
    userCount: 6,
    health: 92,
    nextAction: "Acompanhar implantacao",
    trialDaysRemaining: 2,
    billingStatus: "trial_ending",
    onboardingChecklist: [],
    asaas: {
      checkoutReady: false,
      providerSubscriptionId: null,
      nextStep: "monitor_webhooks",
    },
    support: {
      priority: "high",
      status: "in_progress",
      relationshipOwnerName: "Marina Costa",
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      slaTier: "priority",
      queueLabel: "Follow-up amanha",
      alertType: "trial_ending",
    },
  },
];

function toneForAlert(
  type: PlatformTenant["support"] extends infer T
    ? T extends { alertType?: infer A }
      ? A
      : never
    : never,
) {
  if (type === "past_due") {
    return "gm-badge-danger";
  }
  if (type === "trial_ending" || type === "high_priority") {
    return "gm-badge-warn";
  }
  if (type === "follow_up") {
    return "gm-badge-info";
  }
  return "gm-badge-neutral";
}

function alertLabel(
  type: PlatformTenant["support"] extends infer T
    ? T extends { alertType?: infer A }
      ? A
      : never
    : never,
) {
  if (type === "past_due") {
    return "Inadimplencia";
  }
  if (type === "trial_ending") {
    return "Trial acabando";
  }
  if (type === "high_priority") {
    return "Alta prioridade";
  }
  if (type === "follow_up") {
    return "Follow-up";
  }
  return "Sem alerta";
}

function billingStatusLabel(status: PlatformTenant["billingStatus"]) {
  const labels: Record<PlatformTenant["billingStatus"], string> = {
    healthy: "cobranca saudavel",
    trial_ok: "trial ativo",
    trial_ending: "trial acabando",
    payment_required: "pagamento pendente",
    access_blocked: "acesso bloqueado",
  };
  return labels[status];
}

export default function PlatformSupportPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>(demoTenants);
  const [status, setStatus] = useState("demo");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SupportFilter>("all");

  useEffect(() => {
    async function load() {
      try {
        const rows = await listPlatformTenants();
        setTenants(rows.filter((tenant) => tenant.support));
        setStatus("online");
      } catch (error) {
        const apiError = error as ApiError;
        setStatus(apiError.status ? `demo-${apiError.status}` : "demo");
      }
    }

    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const supportStatus = tenant.support?.status ?? "queued";
      const matchesFilter = filter === "all" ? true : supportStatus === filter;
      const haystack =
        `${tenant.name} ${tenant.slug} ${tenant.support?.relationshipOwnerName ?? ""} ${tenant.support?.queueLabel ?? ""}`
          .toLowerCase()
          .trim();
      const matchesSearch = normalizedSearch.length === 0 || haystack.includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, tenants]);

  const counters = useMemo(
    () => ({
      queued: tenants.filter((tenant) => tenant.support?.status === "queued").length,
      inProgress: tenants.filter((tenant) => tenant.support?.status === "in_progress").length,
      waiting: tenants.filter((tenant) => tenant.support?.status === "waiting_customer").length,
      resolved: tenants.filter((tenant) => tenant.support?.status === "resolved").length,
      alerts: tenants.filter(
        (tenant) => tenant.support?.alertType && tenant.support.alertType !== "none",
      ).length,
    }),
    [tenants],
  );
  const timeline = useMemo(
    () =>
      filtered
        .flatMap((tenant) => {
          const items = [
            {
              id: `${tenant.id}-status`,
              title: tenant.support?.queueLabel || "Na fila",
              detail: `${tenant.name} · ${tenant.support?.status ?? "queued"}`,
              when: tenant.createdAt,
            },
          ];
          if (tenant.support?.nextFollowUpAt) {
            items.unshift({
              id: `${tenant.id}-follow-up`,
              title: "Follow-up programado",
              detail: `${tenant.name} · ${new Date(tenant.support.nextFollowUpAt).toLocaleString("pt-BR")}`,
              when: tenant.support.nextFollowUpAt,
            });
          }
          return items;
        })
        .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
        .slice(0, 8),
    [filtered],
  );

  function handleExportSupportCsv() {
    const rows = [
      [
        "tenant",
        "slug",
        "status_tenant",
        "status_suporte",
        "prioridade",
        "sla",
        "alerta",
        "responsavel",
        "follow_up",
        "plano",
        "mrr_cents",
      ],
      ...filtered.map((tenant) => [
        tenant.name,
        tenant.slug,
        tenant.status,
        tenant.support?.status ?? "queued",
        tenant.support?.priority ?? "normal",
        tenant.support?.slaTier ?? "standard",
        tenant.support?.alertType ?? "none",
        tenant.support?.relationshipOwnerName ?? "",
        tenant.support?.nextFollowUpAt ?? "",
        tenant.planName ?? tenant.planCode ?? "",
        String(tenant.priceCents ?? 0),
      ]),
    ];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "giromesa-fila-suporte.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSupportPdf() {
    const popup = window.open("", "_blank", "width=1120,height=820");
    if (!popup) {
      return;
    }

    const rows = filtered
      .map(
        (tenant) => `
          <tr>
            <td>${escapeHtml(tenant.name)}</td>
            <td>${escapeHtml(tenant.support?.status ?? "queued")}</td>
            <td>${escapeHtml(tenant.support?.priority ?? "normal")}</td>
            <td>${escapeHtml(tenant.support?.slaTier ?? "standard")}</td>
            <td>${escapeHtml(alertLabel(tenant.support?.alertType ?? "none"))}</td>
            <td>${escapeHtml(tenant.support?.relationshipOwnerName || "Sem responsavel")}</td>
            <td>${escapeHtml(
              tenant.support?.nextFollowUpAt
                ? new Date(tenant.support.nextFollowUpAt).toLocaleString("pt-BR")
                : "-",
            )}</td>
          </tr>`,
      )
      .join("");

    const html = renderBrandedPrintDocument({
      branding: {
        displayName: "GiroMesa Platform",
        logoUrl: null,
        accentPreset: "violet",
      },
      documentLabel: "Backoffice SaaS",
      title: "Fila executiva de suporte",
      subtitle:
        "Leitura consolidada de tenants em acompanhamento, com prioridade, SLA, alerta comercial e proximo follow-up.",
      metadata: [
        { label: "Itens filtrados", value: String(filtered.length) },
        { label: "Alertas", value: String(counters.alerts) },
        { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
      ],
      metrics: [
        { label: "Na fila", value: String(counters.queued) },
        { label: "Em andamento", value: String(counters.inProgress) },
        { label: "Aguardando cliente", value: String(counters.waiting) },
        {
          label: "MRR filtrado",
          value: formatMoney(filtered.reduce((sum, tenant) => sum + (tenant.priceCents ?? 0), 0)),
        },
      ],
      bodyHtml: `
        <section class="section">
          <h2>Fila operacional</h2>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>SLA</th>
                <th>Alerta</th>
                <th>Responsavel</th>
                <th>Proximo follow-up</th>
              </tr>
            </thead>
            <tbody>${rows || "<tr><td colspan='7'>Nenhum tenant nos filtros atuais.</td></tr>"}</tbody>
          </table>
        </section>
      `,
      footerNote:
        "Exportacao executiva da fila de suporte do GiroMesa para leitura gerencial, operacao comercial e acompanhamento de risco.",
    });

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="/platform">
          <span className="brand-mark">G</span>
          <span>Platform</span>
        </a>
        <nav>
          <a href="/platform">
            <ArrowLeft size={18} /> Voltar
          </a>
          <a className="active" href="/platform/support">
            <LifeBuoy size={18} /> Fila de suporte
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">Backoffice SaaS - {status}</span>
            <h1>Fila de suporte</h1>
            <p>Atendimento comercial e operacional com foco em SLA, cobranca e conversao.</p>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={handleExportSupportCsv}>
              <Download size={17} /> CSV
            </button>
            <button className="button primary" type="button" onClick={handleExportSupportPdf}>
              <FileText size={17} /> PDF
            </button>
          </div>
        </header>

        <section className="metrics compact">
          <article className="metric">
            <span>Na fila</span>
            <strong>{counters.queued}</strong>
            <small>Aguardando primeira acao</small>
          </article>
          <article className="metric">
            <span>Em andamento</span>
            <strong>{counters.inProgress}</strong>
            <small>Atendimentos ativos</small>
          </article>
          <article className="metric">
            <span>Aguardando cliente</span>
            <strong>{counters.waiting}</strong>
            <small>Dependem de retorno</small>
          </article>
          <article className="metric">
            <span>Alertas</span>
            <strong>{counters.alerts}</strong>
            <small>Trial acabando ou cobranca</small>
          </article>
        </section>

        <section className="platform-support-toolbar panel">
          <label className="platform-search">
            Busca
            <div className="platform-search-input">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tenant, responsavel ou contexto"
              />
            </div>
          </label>
          <label className="platform-search">
            Status
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as SupportFilter)}
            >
              <option value="all">Todos</option>
              <option value="queued">Na fila</option>
              <option value="in_progress">Em andamento</option>
              <option value="waiting_customer">Aguardando cliente</option>
              <option value="resolved">Resolvido</option>
            </select>
          </label>
        </section>

        <section className="platform-support-layout">
          <article className="panel">
            <div className="panel-title">
              <LifeBuoy size={20} />
              <div>
                <h2>Itens da fila</h2>
                <p>Ordene pela urgencia certa, nao pelo grito mais alto.</p>
              </div>
            </div>
            <div className="platform-support-list">
              {filtered.length ? (
                filtered.map((tenant) => (
                  <a
                    className="platform-support-item inline-link"
                    href={`/platform/${tenant.id}`}
                    key={tenant.id}
                  >
                    <div className="platform-support-item-head">
                      <div>
                        <strong>{tenant.name}</strong>
                        <span>
                          {tenant.support?.relationshipOwnerName || "Sem responsavel"} ·{" "}
                          {tenant.support?.queueLabel || "Na fila"}
                        </span>
                      </div>
                      <span
                        className={`gm-badge ${toneForAlert(tenant.support?.alertType ?? "none")}`}
                      >
                        {alertLabel(tenant.support?.alertType ?? "none")}
                      </span>
                    </div>
                    <div className="platform-support-item-meta">
                      <span className="gm-badge gm-badge-info">
                        {tenant.support?.slaTier ?? "standard"}
                      </span>
                      <span className="gm-badge gm-badge-warn">
                        {tenant.support?.status ?? "queued"}
                      </span>
                      <small>
                        {tenant.nextAction} · {billingStatusLabel(tenant.billingStatus)}
                      </small>
                    </div>
                  </a>
                ))
              ) : (
                <p className="muted-copy">Nenhum item encontrado com os filtros atuais.</p>
              )}
            </div>
          </article>

          <aside className="panel">
            <div className="panel-title">
              <AlertTriangle size={20} />
              <div>
                <h2>Regras de alerta</h2>
                <p>Os sinais mais quentes da fila agora.</p>
              </div>
            </div>
            <div className="status-list">
              <div className="status-row rich">
                <div>
                  <strong>Inadimplencia</strong>
                  <span>Vai para o topo da fila comercial.</span>
                </div>
                <CreditCard size={16} />
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Trial acabando</strong>
                  <span>Follow-up nos ultimos 3 dias do trial.</span>
                </div>
                <CalendarClock size={16} />
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Alta prioridade</strong>
                  <span>Conta sensivel, risco ou implantacao critica.</span>
                </div>
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="support-history">
              <strong>Timeline ativa</strong>
              {timeline.map((item) => (
                <div className="status-row rich" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <small>{new Date(item.when).toLocaleString("pt-BR")}</small>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
