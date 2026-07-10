"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Flag,
  LifeBuoy,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  type ApiError,
  type PlatformTenant as ApiPlatformTenant,
  createPlatformTenant,
  getPlatformSummary,
  listPlatformTenants,
  type PlatformCommercialSummary,
  type PlatformCommunicationEvent,
  updatePlatformTenantStatus,
} from "../../lib/giromesa-api";

type TenantStatus = "trial" | "active" | "past_due" | "suspended";

type PlatformTenant = {
  id?: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: "Starter" | "Professional" | "Premium";
  mrr: string;
  volume: string;
  health: number;
  owner: string;
  email: string;
  nextAction: string;
  trialDaysRemaining?: number | null;
  billingStatus?: ApiPlatformTenant["billingStatus"];
  onboardingChecklist?: ApiPlatformTenant["onboardingChecklist"];
  asaas?: ApiPlatformTenant["asaas"];
  support?: ApiPlatformTenant["support"];
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

const initialTenants: PlatformTenant[] = [
  {
    name: "Bar Aurora",
    slug: "bar-aurora-demo",
    status: "active",
    plan: "Professional",
    mrr: "R$ 299",
    volume: "R$ 42.180",
    health: 94,
    owner: "Marina Costa",
    email: "marina@bar-aurora-demo.local",
    nextAction: "Acompanhar piloto",
  },
  {
    name: "Pizzaria Vila",
    slug: "pizzaria-vila",
    status: "trial",
    plan: "Starter",
    mrr: "Trial",
    volume: "R$ 9.740",
    health: 78,
    owner: "Rafael Nunes",
    email: "rafael@pizzariavila.local",
    nextAction: "Converter em 5 dias",
  },
  {
    name: "Pub Estacao",
    slug: "pub-estacao",
    status: "past_due",
    plan: "Premium",
    mrr: "R$ 499",
    volume: "R$ 31.220",
    health: 61,
    owner: "Bianca Lopes",
    email: "bianca@pubestacao.local",
    nextAction: "Resolver cobranca",
  },
];

const plans = [
  ["Starter", "R$ 149", "PDV, mesas e cardápio QR"],
  ["Professional", "R$ 299", "KDS, estoque e caixa completo"],
  ["Premium", "R$ 499", "Multi-filial, WhatsApp e automacoes"],
] as const;

const planPrices: Record<PlatformTenant["plan"], string> = {
  Starter: "R$ 149",
  Professional: "R$ 299",
  Premium: "R$ 499",
};

function toneForStatus(status: TenantStatus) {
  if (status === "active") {
    return "good";
  }
  if (status === "past_due" || status === "suspended") {
    return "danger";
  }
  return "warn";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export default function PlatformPage() {
  const [tenants, setTenants] = useState(initialTenants);
  const [communications, setCommunications] = useState<PlatformCommunicationEvent[]>([]);
  const [summary, setSummary] = useState<PlatformCommercialSummary | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  const [form, setForm] = useState({
    name: "Novo Restaurante",
    owner: "Responsavel",
    email: "responsavel@cliente.local",
    plan: "Professional" as PlatformTenant["plan"],
  });
  const [platformNote, setPlatformNote] = useState(
    "Fluxo local de onboarding pronto para virar endpoint protegido de plataforma.",
  );
  const [apiMode, setApiMode] = useState<"loading" | "connected" | "demo">("loading");

  const metrics = useMemo(() => {
    if (summary) {
      return {
        active: summary.overview.active,
        trials: summary.overview.trials,
        risks: summary.overview.risks,
        mrr: summary.overview.mrrActiveCents / 100,
        supportQueue: summary.overview.supportQueue,
        trialEnding: summary.overview.trialEnding,
        followUpsDue: summary.overview.followUpsDue,
        highTouchAccounts: summary.overview.highTouchAccounts,
        pastDueMrr: summary.overview.pastDueMrrCents / 100,
        communicationsLast7Days: summary.overview.communicationsLast7Days,
      };
    }

    const active = tenants.filter((tenant) => tenant.status === "active").length;
    const trials = tenants.filter((tenant) => tenant.status === "trial").length;
    const risks = tenants.filter((tenant) => tenant.status !== "active").length;
    const mrr = tenants.reduce((sum, tenant) => {
      if (tenant.status !== "active") {
        return sum;
      }
      return sum + Number(planPrices[tenant.plan].replace(/\D/g, ""));
    }, 0);
    const supportQueue = tenants.filter((tenant) => tenant.support?.status !== "resolved").length;
    const trialEnding = tenants.filter((tenant) => tenant.billingStatus === "trial_ending").length;
    const followUpsDue = tenants.filter(
      (tenant) => tenant.support?.alertType === "follow_up",
    ).length;
    const highTouchAccounts = tenants.filter(
      (tenant) =>
        tenant.support?.priority === "high" ||
        tenant.support?.slaTier === "priority" ||
        tenant.support?.slaTier === "critical",
    ).length;

    return {
      active,
      trials,
      risks,
      mrr,
      supportQueue,
      trialEnding,
      followUpsDue,
      highTouchAccounts,
      pastDueMrr: 0,
      communicationsLast7Days: communications.length,
    };
  }, [communications.length, summary, tenants]);

  const supportQueue = useMemo(() => {
    if (summary) {
      return summary.support.items.map((item) => ({
        id: item.tenantId,
        name: item.tenantName,
        slug: item.tenantSlug,
        status: "active" as TenantStatus,
        plan: "Professional" as const,
        mrr: "",
        volume: "",
        health: 0,
        owner: item.relationshipOwnerName || "Sem responsavel",
        email: "",
        nextAction: item.queueLabel,
        support: {
          priority: item.priority,
          status: item.status,
          relationshipOwnerName: item.relationshipOwnerName,
          nextFollowUpAt: null,
          slaTier: item.slaTier,
          queueLabel: item.queueLabel,
          alertType: item.alertType,
        },
      }));
    }

    return tenants
      .filter((tenant) => tenant.support && tenant.support.status !== "resolved")
      .sort((a, b) => {
        const score = (tenant: PlatformTenant) => {
          const priority = tenant.support?.priority === "high" ? 3 : 1;
          const sla =
            tenant.support?.slaTier === "critical"
              ? 3
              : tenant.support?.slaTier === "priority"
                ? 2
                : 1;
          return priority + sla;
        };
        return score(b) - score(a);
      })
      .slice(0, 6);
  }, [summary, tenants]);
  const commercialAgenda = useMemo(() => {
    if (summary) {
      return summary.agenda.items.map((item) => ({
        id: item.tenantId,
        name: item.tenantName,
        slug: item.tenantSlug,
        status: item.status === "canceled" ? "suspended" : item.status,
        plan: "Professional" as const,
        mrr: "",
        volume: "",
        health: 0,
        owner: "",
        email: "",
        nextAction: item.nextAction,
        support: {
          priority: item.alertType === "high_priority" ? "high" : "normal",
          status: "queued",
          relationshipOwnerName: "",
          nextFollowUpAt: null,
          slaTier: "standard",
          queueLabel: item.queueLabel,
          alertType: item.alertType,
        },
      }));
    }

    return tenants
      .filter(
        (tenant) =>
          tenant.status === "trial" ||
          tenant.status === "past_due" ||
          tenant.support?.alertType === "follow_up",
      )
      .sort(
        (a, b) =>
          (b.support?.priority === "high" ? 1 : 0) - (a.support?.priority === "high" ? 1 : 0),
      )
      .slice(0, 6);
  }, [summary, tenants]);
  const pipelineMetrics = useMemo(() => {
    if (summary) {
      return summary.pipeline;
    }

    return {
      active: tenants.filter((tenant) => tenant.status === "active").length,
      trial: tenants.filter((tenant) => tenant.status === "trial").length,
      pastDue: tenants.filter((tenant) => tenant.status === "past_due").length,
      onboardingRisk: tenants.filter(
        (tenant) =>
          tenant.status === "trial" &&
          (tenant.onboardingChecklist?.filter((item) => item.done).length ?? 0) < 4,
      ).length,
    };
  }, [summary, tenants]);

  const filteredTenants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchesStatus = statusFilter === "all" ? true : tenant.status === statusFilter;
      const haystack =
        `${tenant.name} ${tenant.slug} ${tenant.owner} ${tenant.email} ${tenant.plan}`
          .toLowerCase()
          .trim();
      const matchesSearch = normalizedSearch.length === 0 || haystack.includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, tenants]);

  useEffect(() => {
    async function loadTenants() {
      try {
        const rows = await listPlatformTenants();
        setTenants(rows.map(mapApiTenant));
        const summaryRows = await getPlatformSummary();
        setSummary(summaryRows);
        setCommunications(summaryRows.communications.recent);
        setApiMode("connected");
        setPlatformNote("Backoffice conectado ao endpoint protegido de plataforma.");
      } catch (error) {
        const maybeApiError = error as ApiError;
        setApiMode("demo");
        setPlatformNote(
          maybeApiError.status === 403 || maybeApiError.status === 401
            ? "Entre como owner@giromesa.local para operar o backoffice SaaS real."
            : "API de plataforma indisponivel. Mantendo modo demonstracao.",
        );
      }
    }

    void loadTenants();
  }, []);

  async function handleCreateTenant() {
    const slug = slugify(form.name) || `tenant-${tenants.length + 1}`;
    if (tenants.some((tenant) => tenant.slug === slug)) {
      setPlatformNote("Slug ja existe. Ajuste o nome antes de provisionar.");
      return;
    }

    if (apiMode === "connected") {
      try {
        const created = await createPlatformTenant({
          name: form.name,
          ownerName: form.owner,
          ownerEmail: form.email,
          planCode: form.plan.toLowerCase() as "starter" | "professional" | "premium",
          branchName: "Matriz",
        });
        const rows = await listPlatformTenants();
        setTenants(rows.map(mapApiTenant));
        setSummary(await getPlatformSummary());
        setPlatformNote(
          `${created.tenant.name} criado. Senha temporaria: ${created.temporaryPassword}`,
        );
        return;
      } catch (error) {
        setPlatformNote(error instanceof Error ? error.message : "Falha ao criar tenant real.");
        return;
      }
    }

    const nextTenant: PlatformTenant = {
      name: form.name,
      slug,
      owner: form.owner,
      email: form.email,
      plan: form.plan,
      status: "trial",
      mrr: "Trial",
      volume: "R$ 0",
      health: 72,
      nextAction: "Enviar convite e configurar filial",
    };
    setTenants((current) => [nextTenant, ...current]);
    setPlatformNote(`${form.name} entrou no onboarding local. Proximo passo: endpoint real.`);
  }

  async function updateTenantStatus(slug: string, status: TenantStatus) {
    const target = tenants.find((tenant) => tenant.slug === slug);
    if (apiMode === "connected" && target?.id) {
      try {
        await updatePlatformTenantStatus(target.id, status);
        const rows = await listPlatformTenants();
        setTenants(rows.map(mapApiTenant));
        setSummary(await getPlatformSummary());
        setPlatformNote(`${target.name} atualizado para ${status}.`);
        return;
      } catch (error) {
        setPlatformNote(error instanceof Error ? error.message : "Falha ao atualizar tenant.");
        return;
      }
    }

    setTenants((current) =>
      current.map((tenant) =>
        tenant.slug === slug
          ? {
              ...tenant,
              status,
              mrr: status === "active" ? planPrices[tenant.plan] : tenant.mrr,
              nextAction: status === "suspended" ? "Regularizar acesso" : "Acompanhar saude",
            }
          : tenant,
      ),
    );
  }

  function handleExportPlatformCsv() {
    const rows = [
      [
        "tenant",
        "slug",
        "status",
        "plano",
        "mrr",
        "responsavel",
        "email",
        "health",
        "proxima_acao",
      ],
      ...filteredTenants.map((tenant) => [
        tenant.name,
        tenant.slug,
        tenant.status,
        tenant.plan,
        tenant.mrr,
        tenant.owner,
        tenant.email,
        String(tenant.health),
        tenant.nextAction,
      ]),
    ];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "giromesa-platform-tenants.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportPlatformPdf() {
    const popup = window.open("", "_blank", "width=1180,height=860");
    if (!popup) {
      return;
    }

    const rows = filteredTenants
      .map(
        (tenant) => `
          <tr>
            <td>${escapeHtml(tenant.name)}</td>
            <td>${escapeHtml(tenant.status)}</td>
            <td>${escapeHtml(tenant.plan)}</td>
            <td>${escapeHtml(tenant.mrr)}</td>
            <td>${escapeHtml(tenant.owner)}</td>
            <td>${escapeHtml(tenant.nextAction)}</td>
          </tr>`,
      )
      .join("");
    const communicationRows = communications
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.tenantName)}</td>
            <td>${escapeHtml(communicationLabel(item.type))}</td>
            <td>${escapeHtml(item.recipientEmail)}</td>
            <td>${escapeHtml(new Date(item.createdAt).toLocaleString("pt-BR"))}</td>
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
      title: "Panorama executivo de tenants",
      subtitle:
        "Leitura consolidada de operacao comercial, saude, trials e tenants em acompanhamento.",
      metadata: [
        { label: "Total filtrado", value: String(filteredTenants.length) },
        { label: "Modo", value: apiMode === "connected" ? "API conectada" : "Demonstracao" },
        { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
      ],
      metrics: [
        { label: "MRR ativo", value: `R$ ${metrics.mrr.toLocaleString("pt-BR")}` },
        { label: "Tenants ativos", value: String(metrics.active) },
        { label: "Trials", value: String(metrics.trials) },
        { label: "Fila de suporte", value: String(metrics.supportQueue) },
      ],
      bodyHtml: `
        <section class="section">
          <h2>Tenants em acompanhamento</h2>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Status</th>
                <th>Plano</th>
                <th>MRR</th>
                <th>Responsavel</th>
                <th>Proxima acao</th>
              </tr>
            </thead>
            <tbody>${rows || "<tr><td colspan='6'>Nenhum tenant nos filtros atuais.</td></tr>"}</tbody>
          </table>
        </section>
        <section class="section">
          <h2>Comunicacoes recentes</h2>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Tipo</th>
                <th>Destino</th>
                <th>Enviado em</th>
              </tr>
            </thead>
            <tbody>${communicationRows || "<tr><td colspan='4'>Nenhuma comunicacao recente.</td></tr>"}</tbody>
          </table>
        </section>
      `,
      footerNote:
        "Exportacao executiva do backoffice GiroMesa para acompanhamento comercial e operacional.",
    });

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>Platform</span>
        </a>
        <div className="tenant-chip">
          <Sparkles size={16} />
          <span>SaaS Owner</span>
        </div>
        <nav>
          <a className="active" href="/platform">
            <Building2 size={18} /> Tenants
          </a>
          <a href="/platform">
            <CreditCard size={18} /> Assinaturas
          </a>
          <a href="/platform">
            <Flag size={18} /> Feature flags
          </a>
          <a href="/platform">
            <Activity size={18} /> Incidentes
          </a>
          <a href="/platform">
            <LifeBuoy size={18} /> Suporte
          </a>
          <a href="/platform/support">
            <AlertTriangle size={18} /> Fila suporte
          </a>
          <a href="/platform">
            <ShieldCheck size={18} /> Auditoria
          </a>
          <a href="/app">
            <Users size={18} /> Demo cliente
          </a>
        </nav>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">Controle do dono da plataforma</span>
            <h1>Backoffice SaaS</h1>
            <p>Tenants, trials, planos, inadimplencia, saude operacional e suporte.</p>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={handleExportPlatformCsv}>
              <Download size={17} /> CSV
            </button>
            <button className="button secondary" type="button" onClick={handleExportPlatformPdf}>
              <FileText size={17} /> PDF
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => void handleCreateTenant()}
            >
              Novo tenant
            </button>
          </div>
        </header>
        <section className="metrics">
          <div className="metric">
            <span>MRR ativo</span>
            <strong>{`R$ ${metrics.mrr.toLocaleString("pt-BR")}`}</strong>
            <small>Somente tenants ativos</small>
          </div>
          <div className="metric">
            <span>Tenants ativos</span>
            <strong>{metrics.active}</strong>
            <small>{metrics.trials} em trial</small>
          </div>
          <div className="metric">
            <span>Risco operacional</span>
            <strong>{metrics.risks}</strong>
            <small>Trial, suspenso ou inadimplente</small>
          </div>
          <div className="metric">
            <span>Status do modulo</span>
            <strong>{apiMode === "connected" ? "API" : "Local"}</strong>
            <small>
              {apiMode === "connected" ? "Endpoint protegido ativo" : "Modo demonstracao"}
            </small>
          </div>
          <div className="metric">
            <span>Fila de suporte</span>
            <strong>{metrics.supportQueue}</strong>
            <small>Tenants com atendimento aberto</small>
          </div>
          <div className="metric">
            <span>Trials no fim</span>
            <strong>{metrics.trialEnding}</strong>
            <small>{metrics.followUpsDue} follow-up(s) vencendo</small>
          </div>
        </section>

        <section className="platform-onboarding">
          <article className="panel platform-form-panel">
            <div className="panel-title">
              <Building2 size={20} />
              <div>
                <h2>Provisionar cliente</h2>
                <p>Rascunho operacional do fluxo que voce usara para vender o SaaS.</p>
              </div>
            </div>
            <div className="platform-form">
              <label>
                Estabelecimento
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Responsavel
                <input
                  value={form.owner}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, owner: event.target.value }))
                  }
                />
              </label>
              <label>
                E-mail admin
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Plano
                <select
                  value={form.plan}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      plan: event.target.value as PlatformTenant["plan"],
                    }))
                  }
                >
                  <option value="Starter">Starter</option>
                  <option value="Professional">Professional</option>
                  <option value="Premium">Premium</option>
                </select>
              </label>
            </div>
            <div className="platform-note">
              <CheckCircle2 size={18} />
              <span>{platformNote}</span>
            </div>
          </article>

          <aside className="panel platform-checklist">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Checklist do onboarding</h2>
                <p>O que o endpoint real devera executar.</p>
              </div>
            </div>
            <ol>
              <li>Criar tenant sem aceitar `tenant_id` do frontend.</li>
              <li>Criar filial inicial, plano, assinatura trial e usuario admin.</li>
              <li>Gerar convite seguro por e-mail.</li>
              <li>Registrar auditoria append-only de plataforma.</li>
              <li>Preparar assinatura Asaas em etapa separada.</li>
            </ol>
          </aside>
        </section>

        <section className="platform-grid">
          <article className="panel platform-command-center">
            <div className="panel-title">
              <Activity size={20} />
              <div>
                <h2>Tenants em acompanhamento</h2>
                <p>Visao para vender, ativar, suspender e priorizar suporte.</p>
              </div>
            </div>
            <div className="platform-toolbar">
              <label className="platform-search">
                Buscar tenant
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, slug, responsavel ou plano"
                />
              </label>
              <label className="platform-search">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | TenantStatus)}
                >
                  <option value="all">Todos</option>
                  <option value="trial">Trial</option>
                  <option value="active">Ativo</option>
                  <option value="past_due">Inadimplente</option>
                  <option value="suspended">Suspenso</option>
                </select>
              </label>
            </div>
            <div className="platform-tenant-list">
              {filteredTenants.map((tenant) => (
                <div className="platform-tenant-row" key={tenant.slug}>
                  <div>
                    <strong>
                      {tenant.id ? (
                        <a className="inline-link" href={`/platform/${tenant.id}`}>
                          {tenant.name}
                        </a>
                      ) : (
                        tenant.name
                      )}
                    </strong>
                    <span>
                      {tenant.owner} - {tenant.email} - {tenant.plan}
                    </span>
                    <small>
                      {tenant.billingStatus ? billingLabel(tenant.billingStatus) : "demo"} ·{" "}
                      {tenant.trialDaysRemaining !== null && tenant.trialDaysRemaining !== undefined
                        ? `${tenant.trialDaysRemaining} dia(s) de trial`
                        : tenant.nextAction}
                    </small>
                  </div>
                  <meter
                    className="platform-health"
                    aria-label={`Saude ${tenant.health}%`}
                    min={0}
                    max={100}
                    value={tenant.health}
                  />
                  <span>{tenant.mrr}</span>
                  <Badge tone={toneForStatus(tenant.status)}>{tenant.status}</Badge>
                  <Badge tone={tenant.asaas?.checkoutReady ? "warn" : "good"}>
                    {tenant.asaas?.checkoutReady ? "checkout pendente" : "cobranca ok"}
                  </Badge>
                  <div className="platform-row-actions">
                    <button
                      className="button secondary compact"
                      type="button"
                      onClick={() => void updateTenantStatus(tenant.slug, "active")}
                    >
                      <PlayCircle size={15} /> Ativar
                    </button>
                    <button
                      className="button ghost compact"
                      type="button"
                      onClick={() => void updateTenantStatus(tenant.slug, "suspended")}
                    >
                      <PauseCircle size={15} /> Suspender
                    </button>
                  </div>
                </div>
              ))}
              {filteredTenants.length === 0 ? (
                <p className="muted-copy">Nenhum tenant encontrado com os filtros atuais.</p>
              ) : null}
            </div>
          </article>

          <aside className="panel platform-side">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Proximas acoes</h2>
                <p>O que precisa de atencao antes de vender em escala.</p>
              </div>
            </div>
            <div className="status-list">
              <div className="status-row rich">
                <div>
                  <strong>Onboarding SaaS</strong>
                  <span>
                    {tenants[0]?.onboardingChecklist?.filter((item) => item.done).length ?? 0}/
                    {tenants[0]?.onboardingChecklist?.length ?? 5} etapas concluidas no tenant mais
                    recente.
                  </span>
                </div>
                <Badge tone="warn">novo</Badge>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Endpoint real</strong>
                  <span>Criar tenant, filial, admin e plano com permissao de plataforma.</span>
                </div>
                <Badge tone="warn">proximo</Badge>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Assinatura Asaas</strong>
                  <span>Ativar, cobrar, suspender e reativar por webhook.</span>
                </div>
                <Badge tone="warn">pendente</Badge>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Suporte e SLA</strong>
                  <span>{metrics.supportQueue} tenant(s) exigem acompanhamento.</span>
                </div>
                <Badge tone={metrics.supportQueue > 0 ? "warn" : "good"}>
                  {metrics.supportQueue > 0 ? "ativo" : "limpo"}
                </Badge>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Alertas comerciais</strong>
                  <span>
                    {metrics.trialEnding} trial(s) no fim, {pipelineMetrics.pastDue} inadimplente(s){" "}
                    e MRR em risco de {`R$ ${metrics.pastDueMrr.toLocaleString("pt-BR")}`}.
                  </span>
                </div>
                <a className="button ghost compact" href="/platform/support">
                  Abrir fila
                </a>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Contas high-touch</strong>
                  <span>
                    {metrics.highTouchAccounts} tenant(s) com prioridade alta ou SLA elevado;{" "}
                    {metrics.communicationsLast7Days} comunicacao(oes) nos ultimos 7 dias.
                  </span>
                </div>
                <Badge tone={metrics.highTouchAccounts > 0 ? "warn" : "good"}>
                  {metrics.highTouchAccounts > 0 ? "acompanhar" : "estavel"}
                </Badge>
              </div>
            </div>
          </aside>
        </section>

        <section className="platform-grid">
          <article className="panel">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Pipeline comercial</h2>
                <p>Leitura de conversao, onboarding e risco imediato da carteira.</p>
              </div>
            </div>
            <div className="report-comparison-grid">
              <div>
                <span>Trials ativos</span>
                <strong>{pipelineMetrics.trial}</strong>
                <small>{pipelineMetrics.onboardingRisk} com onboarding incompleto</small>
              </div>
              <div>
                <span>Ativos</span>
                <strong>{pipelineMetrics.active}</strong>
                <small>Base recorrente operacional</small>
              </div>
              <div>
                <span>Past due</span>
                <strong>{pipelineMetrics.pastDue}</strong>
                <small>{`MRR em risco: R$ ${metrics.pastDueMrr.toLocaleString("pt-BR")}`}</small>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <LifeBuoy size={20} />
              <div>
                <h2>Fila de suporte</h2>
                <p>Priorizacao rapida por SLA, follow-up e risco comercial.</p>
              </div>
            </div>
            <div className="status-list">
              {supportQueue.length ? (
                supportQueue.map((tenant) => (
                  <a
                    className="status-row rich inline-link"
                    key={tenant.slug}
                    href={tenant.id ? `/platform/${tenant.id}` : "/platform"}
                  >
                    <div>
                      <strong>{tenant.name}</strong>
                      <span>
                        {tenant.support?.relationshipOwnerName || "Sem responsavel"} ·{" "}
                        {tenant.support?.queueLabel || "Na fila"}
                      </span>
                    </div>
                    <span
                      className={`gm-badge ${tenant.support?.priority === "high" ? "gm-badge-warn" : "gm-badge-info"}`}
                    >
                      {tenant.support?.slaTier ?? "standard"}
                    </span>
                  </a>
                ))
              ) : (
                <p className="muted-copy">Sem atendimentos em aberto agora.</p>
              )}
            </div>
            {summary ? (
              <div className="platform-support-footnote">
                <small>
                  {summary.support.countsByStatus.queued} na fila,{" "}
                  {summary.support.countsByStatus.inProgress} em andamento,{" "}
                  {summary.support.countsByStatus.waitingCustomer} aguardando cliente.
                </small>
              </div>
            ) : null}
          </article>
          <article className="panel">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Comunicacoes globais</h2>
                <p>Historico recente de trial, inadimplencia e follow-up no nivel SaaS.</p>
              </div>
            </div>
            <div className="status-list">
              {communications.length ? (
                communications.map((item) => (
                  <a
                    className="status-row rich inline-link"
                    key={item.id}
                    href={`/platform/${item.tenantId}`}
                  >
                    <div>
                      <strong>{item.tenantName}</strong>
                      <span>
                        {communicationLabel(item.type)} · {item.recipientEmail}
                      </span>
                    </div>
                    <span className="muted-copy">
                      {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </a>
                ))
              ) : (
                <p className="muted-copy">Nenhuma comunicacao global registrada por enquanto.</p>
              )}
            </div>
          </article>
          <article className="panel">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Agenda do dia</h2>
                <p>Sequencia de follow-up para trial, cobranca e implantacao.</p>
              </div>
            </div>
            <div className="status-list">
              {commercialAgenda.length ? (
                commercialAgenda.map((tenant) => (
                  <a
                    className="status-row rich inline-link"
                    key={tenant.slug}
                    href={tenant.id ? `/platform/${tenant.id}` : "/platform"}
                  >
                    <div>
                      <strong>{tenant.name}</strong>
                      <span>
                        {tenant.status === "trial"
                          ? "Trial em conversao"
                          : tenant.status === "past_due"
                            ? "Regularizacao financeira"
                            : "Follow-up comercial"}
                      </span>
                    </div>
                    <small>{tenant.support?.queueLabel ?? tenant.nextAction}</small>
                  </a>
                ))
              ) : (
                <p className="muted-copy">Sem follow-ups comerciais urgentes agora.</p>
              )}
            </div>
            {summary ? (
              <div className="platform-support-footnote">
                <small>
                  Agenda: {summary.agenda.countsByAlertType.pastDue} cobranca,{" "}
                  {summary.agenda.countsByAlertType.trialEnding} fim de trial,{" "}
                  {summary.agenda.countsByAlertType.followUp} follow-up.
                </small>
              </div>
            ) : null}
          </article>
        </section>

        <section className="platform-plan-grid">
          {plans.map(([name, price, detail]) => (
            <article className="panel platform-plan" key={name}>
              <span>{name}</span>
              <strong>{price}</strong>
              <p>{detail}</p>
            </article>
          ))}
          <article className="panel platform-risk-card">
            <AlertTriangle size={22} />
            <div>
              <strong>VPS em validação</strong>
              <p>
                Ambiente de testes ativo. Prioridade atual: UX, fluxos críticos, relatórios e
                hardening.
              </p>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function mapApiTenant(tenant: ApiPlatformTenant): PlatformTenant {
  const planName = normalizePlanName(tenant.planName ?? tenant.planCode ?? "Starter");
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status === "canceled" ? "suspended" : tenant.status,
    plan: planName,
    mrr: tenant.status === "active" ? formatPlanPrice(tenant.priceCents) : "Trial",
    volume: `${tenant.branchCount} filial(is)`,
    health: tenant.health,
    owner: "Admin cadastrado",
    email: `${tenant.userCount} usuario(s)`,
    nextAction: tenant.nextAction,
    trialDaysRemaining: tenant.trialDaysRemaining,
    billingStatus: tenant.billingStatus,
    onboardingChecklist: tenant.onboardingChecklist,
    asaas: tenant.asaas,
    support: tenant.support,
  };
}

function billingLabel(status: ApiPlatformTenant["billingStatus"]) {
  const labels: Record<ApiPlatformTenant["billingStatus"], string> = {
    healthy: "cobranca saudavel",
    trial_ok: "trial em andamento",
    trial_ending: "trial perto do fim",
    payment_required: "pagamento pendente",
    access_blocked: "acesso bloqueado",
  };
  return labels[status];
}

function normalizePlanName(value: string): PlatformTenant["plan"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("premium")) {
    return "Premium";
  }
  if (normalized.includes("professional")) {
    return "Professional";
  }
  return "Starter";
}

function formatPlanPrice(priceCents: number | null) {
  if (!priceCents) {
    return "R$ 0";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(priceCents / 100);
}

function communicationLabel(type: PlatformCommunicationEvent["type"]) {
  const labels: Record<PlatformCommunicationEvent["type"], string> = {
    trial_ending: "Trial acabando",
    past_due: "Cobranca pendente",
    support_follow_up: "Follow-up comercial",
  };
  return labels[type];
}
