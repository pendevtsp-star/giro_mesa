"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  LifeBuoy,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { use, useEffect, useState } from "react";
import {
  formatMoney,
  getPlatformTenant,
  type PlatformTenantDetail,
  preparePlatformTenantAsaasCheckout,
  sendPlatformTenantCommunication,
  simulatePlatformTenantPastDue,
  updatePlatformTenantStatus,
  updatePlatformTenantSupport,
} from "../../../lib/giromesa-api";

const fallbackTenant: PlatformTenantDetail = {
  id: "demo",
  name: "Bar Aurora",
  slug: "bar-aurora-demo",
  document: "00.000.000/0001-00",
  status: "trial",
  createdAt: new Date().toISOString(),
  planCode: "professional",
  planName: "Professional",
  priceCents: 29900,
  subscriptionStatus: "trial",
  currentPeriodEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
  branchCount: 1,
  userCount: 6,
  health: 82,
  nextAction: "Concluir onboarding e ativar assinatura",
  trialDaysRemaining: 12,
  billingStatus: "trial_ok",
  onboardingChecklist: [
    { key: "tenant_created", label: "Ambiente criado", done: true },
    { key: "branch_created", label: "Filial inicial cadastrada", done: true },
    { key: "owner_created", label: "Administrador criado", done: true },
    { key: "plan_selected", label: "Plano definido", done: true },
    { key: "subscription_active", label: "Assinatura ativa", done: false },
  ],
  asaas: {
    checkoutReady: true,
    providerSubscriptionId: null,
    nextStep: "create_hosted_checkout_or_subscription",
  },
  branches: [{ id: "demo-branch", name: "Matriz", isActive: true }],
  users: [
    { id: "demo-user", name: "Admin Aurora", email: "admin@bar-aurora-demo.local", isActive: true },
  ],
  timeline: [
    {
      id: "demo-audit",
      action: "platform.tenant.created",
      entityType: "tenant",
      metadata: { planCode: "professional" },
      createdAt: new Date().toISOString(),
    },
  ],
  support: {
    priority: "normal",
    status: "queued",
    queueLabel: "Na fila",
    commercialNotes: "",
    relationshipOwnerName: "",
    relationshipOwnerEmail: "",
    slaTier: "standard",
    nextFollowUpAt: null,
    contactHistory: [],
  },
};

export default function PlatformTenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [tenant, setTenant] = useState<PlatformTenantDetail>(fallbackTenant);
  const [status, setStatus] = useState("demo");
  const [asaasMessage, setAsaasMessage] = useState("Checkout Asaas ainda nao preparado.");
  const [supportNotes, setSupportNotes] = useState(fallbackTenant.support.commercialNotes);
  const [supportPriority, setSupportPriority] = useState<"normal" | "high">(
    fallbackTenant.support.priority,
  );
  const [supportStatus, setSupportStatus] = useState<
    "queued" | "in_progress" | "waiting_customer" | "resolved"
  >(fallbackTenant.support.status);
  const [relationshipOwnerName, setRelationshipOwnerName] = useState(
    fallbackTenant.support.relationshipOwnerName,
  );
  const [relationshipOwnerEmail, setRelationshipOwnerEmail] = useState(
    fallbackTenant.support.relationshipOwnerEmail,
  );
  const [slaTier, setSlaTier] = useState<"standard" | "priority" | "critical">(
    fallbackTenant.support.slaTier,
  );
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    fallbackTenant.support.nextFollowUpAt?.slice(0, 16) ?? "",
  );
  const [contactSummary, setContactSummary] = useState("");
  const [communicationStatus, setCommunicationStatus] = useState("Nenhuma comunicacao recente.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    getPlatformTenant(tenantId)
      .then((response) => {
        if (!ignore) {
          setTenant(response);
          setSupportNotes(response.support.commercialNotes);
          setSupportPriority(response.support.priority);
          setSupportStatus(response.support.status);
          setRelationshipOwnerName(response.support.relationshipOwnerName);
          setRelationshipOwnerEmail(response.support.relationshipOwnerEmail);
          setSlaTier(response.support.slaTier);
          setNextFollowUpAt(response.support.nextFollowUpAt?.slice(0, 16) ?? "");
          setStatus("online");
        }
      })
      .catch(() => {
        if (!ignore) {
          setStatus("demo");
        }
      });

    return () => {
      ignore = true;
    };
  }, [tenantId]);

  async function changeStatus(nextStatus: PlatformTenantDetail["status"]) {
    if (tenant.id === "demo") {
      setTenant((current) => ({ ...current, status: nextStatus }));
      return;
    }

    setBusy(true);
    try {
      await updatePlatformTenantStatus(tenant.id, nextStatus);
      const refreshed = await getPlatformTenant(tenant.id);
      setTenant(refreshed);
      setStatus(`status: ${nextStatus}`);
    } finally {
      setBusy(false);
    }
  }

  async function prepareCheckout() {
    if (tenant.id === "demo") {
      setAsaasMessage("Checkout mock preparado para ambiente demo.");
      return;
    }

    setBusy(true);
    try {
      const checkout = await preparePlatformTenantAsaasCheckout(tenant.id);
      setAsaasMessage(`${checkout.reference}: ${checkout.nextStep}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveSupport() {
    if (tenant.id === "demo") {
      setTenant((current) => ({
        ...current,
        support: {
          priority: supportPriority,
          status: supportStatus,
          queueLabel:
            supportStatus === "resolved"
              ? "Resolvido"
              : supportStatus === "waiting_customer"
                ? "Aguardando cliente"
                : supportStatus === "in_progress"
                  ? "Em atendimento"
                  : "Na fila",
          commercialNotes: supportNotes,
          relationshipOwnerName,
          relationshipOwnerEmail,
          slaTier,
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
          contactHistory: contactSummary.trim()
            ? [
                {
                  id: `demo-${Date.now()}`,
                  summary: contactSummary.trim(),
                  createdAt: new Date().toISOString(),
                  createdBy: "platform-demo",
                },
                ...current.support.contactHistory,
              ].slice(0, 12)
            : current.support.contactHistory,
        },
      }));
      setContactSummary("");
      setStatus("suporte: demo");
      return;
    }

    setBusy(true);
    try {
      await updatePlatformTenantSupport(tenant.id, {
        priority: supportPriority,
        supportStatus,
        commercialNotes: supportNotes,
        relationshipOwnerName,
        relationshipOwnerEmail,
        slaTier,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
        contactSummary,
      });
      const refreshed = await getPlatformTenant(tenant.id);
      setTenant(refreshed);
      setSupportNotes(refreshed.support.commercialNotes);
      setSupportPriority(refreshed.support.priority);
      setSupportStatus(refreshed.support.status);
      setRelationshipOwnerName(refreshed.support.relationshipOwnerName);
      setRelationshipOwnerEmail(refreshed.support.relationshipOwnerEmail);
      setSlaTier(refreshed.support.slaTier);
      setNextFollowUpAt(refreshed.support.nextFollowUpAt?.slice(0, 16) ?? "");
      setContactSummary("");
      setStatus("suporte: salvo");
    } finally {
      setBusy(false);
    }
  }

  async function simulatePastDue() {
    if (tenant.id === "demo") {
      setTenant((current) => ({
        ...current,
        status: "past_due",
        billingStatus: "payment_required",
      }));
      return;
    }

    setBusy(true);
    try {
      await simulatePlatformTenantPastDue(tenant.id);
      const refreshed = await getPlatformTenant(tenant.id);
      setTenant(refreshed);
      setStatus("asaas: past_due");
    } finally {
      setBusy(false);
    }
  }

  async function sendCommunication(type: "trial_ending" | "past_due" | "support_follow_up") {
    if (tenant.id === "demo") {
      setCommunicationStatus(`Demo: mensagem ${type} preparada para envio.`);
      return;
    }

    setBusy(true);
    try {
      const response = await sendPlatformTenantCommunication(tenant.id, type);
      const refreshed = await getPlatformTenant(tenant.id);
      setTenant(refreshed);
      setCommunicationStatus(
        `Mensagem ${type} enfileirada para ${response.recipientEmail} via ${response.provider}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const completed = tenant.onboardingChecklist.filter((item) => item.done).length;
  const communicationEvents = tenant.timeline.filter((event) =>
    event.action.startsWith("platform.tenant.communication_"),
  );

  function handleExportTenantPdf() {
    const popup = window.open("", "_blank", "width=1120,height=860");
    if (!popup) {
      return;
    }

    const html = renderBrandedPrintDocument({
      branding: {
        displayName: "GiroMesa Platform",
        logoUrl: null,
        accentPreset: "violet",
      },
      documentLabel: "Tenant SaaS",
      title: tenant.name,
      subtitle:
        "Resumo executivo do tenant com onboarding, cobranca, saude, suporte e comunicacoes recentes.",
      metadata: [
        { label: "Slug", value: tenant.slug },
        { label: "Plano", value: tenant.planName ?? tenant.planCode ?? "N/D" },
        { label: "Status", value: tenant.status },
        { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
      ],
      metrics: [
        { label: "MRR", value: formatMoney(tenant.priceCents ?? 0) },
        { label: "Saude", value: `${tenant.health}%` },
        { label: "Usuarios", value: String(tenant.userCount) },
        { label: "Comunicacoes", value: String(communicationEvents.length) },
      ],
      bodyHtml: `
        <section class="section">
          <h2>Leitura do tenant</h2>
          <table>
            <tbody>
              <tr><th>Proxima acao</th><td>${escapeHtml(tenant.nextAction)}</td></tr>
              <tr><th>Billing</th><td>${escapeHtml(tenant.billingStatus)}</td></tr>
              <tr><th>SLA</th><td>${escapeHtml(tenant.support.slaTier)}</td></tr>
              <tr><th>Responsavel comercial</th><td>${escapeHtml(tenant.support.relationshipOwnerName || "Nao definido")}</td></tr>
              <tr><th>Follow-up</th><td>${escapeHtml(tenant.support.nextFollowUpAt ? new Date(tenant.support.nextFollowUpAt).toLocaleString("pt-BR") : "Nao agendado")}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Comunicacoes recentes</h2>
          <table>
            <thead>
              <tr>
                <th>Acao</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>${
              communicationEvents
                .map(
                  (event) => `
                  <tr>
                    <td>${escapeHtml(event.action)}</td>
                    <td>${escapeHtml(new Date(event.createdAt).toLocaleString("pt-BR"))}</td>
                  </tr>`,
                )
                .join("") || "<tr><td colspan='2'>Sem comunicacoes registradas.</td></tr>"
            }</tbody>
          </table>
        </section>
      `,
      footerNote:
        "Exportacao executiva do tenant para acompanhamento de conta, retencao e operacao do SaaS.",
    });

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <main className="app-layout platform-detail-page">
      <aside className="sidebar">
        <a className="brand" href="/platform">
          <span className="brand-mark">G</span>
          <span>Platform</span>
        </a>
        <nav>
          <a href="/platform">
            <ArrowLeft size={18} /> Voltar
          </a>
          <a className="active" href={`/platform/${tenantId}`}>
            <Building2 size={18} /> Detalhe tenant
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">Tenant SaaS - {status}</span>
            <h1>{tenant.name}</h1>
            <p>
              {tenant.slug} - {tenant.planName ?? tenant.planCode ?? "sem plano"} -{" "}
              {tenant.nextAction}
            </p>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={handleExportTenantPdf}>
              <FileText size={17} /> PDF
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void simulatePastDue()}
            >
              <CreditCard size={17} /> Inadimplente
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => void changeStatus("active")}
            >
              <CheckCircle2 size={17} /> Ativar
            </button>
          </div>
        </header>

        <section className="metrics compact">
          <article className="metric">
            <span>Plano</span>
            <strong>{tenant.planName ?? tenant.planCode ?? "N/D"}</strong>
            <small>{formatMoney(tenant.priceCents ?? 0)} / mes</small>
          </article>
          <article className="metric">
            <span>Trial</span>
            <strong>{tenant.trialDaysRemaining ?? 0}d</strong>
            <small>{tenant.billingStatus}</small>
          </article>
          <article className="metric">
            <span>Saude</span>
            <strong>{tenant.health}%</strong>
            <small>{tenant.support.priority === "high" ? "prioridade alta" : "normal"}</small>
          </article>
          <article className="metric">
            <span>Onboarding</span>
            <strong>
              {completed}/{tenant.onboardingChecklist.length}
            </strong>
            <small>{tenant.asaas.nextStep}</small>
          </article>
        </section>

        <section className="platform-detail-grid">
          <article className="panel">
            <div className="panel-title">
              <CalendarClock size={20} />
              <div>
                <h2>Checklist</h2>
                <p>Implantacao comercial e tecnica.</p>
              </div>
            </div>
            <div className="status-list">
              {tenant.onboardingChecklist.map((item) => (
                <div className="status-row rich" key={item.key}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.done ? "Concluido" : "Pendente"}</span>
                  </div>
                  <span className={`gm-badge ${item.done ? "gm-badge-good" : "gm-badge-warn"}`}>
                    {item.done ? "ok" : "falta"}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <LifeBuoy size={20} />
              <div>
                <h2>Suporte</h2>
                <p>Visao rapida para atendimento e retencao.</p>
              </div>
            </div>
            <div className="status-list">
              <div className="status-row rich">
                <div>
                  <strong>Filiais</strong>
                  <span>{tenant.branches.map((branch) => branch.name).join(", ")}</span>
                </div>
                <span>{tenant.branchCount}</span>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Usuarios</strong>
                  <span>{tenant.users.map((user) => user.email).join(", ")}</span>
                </div>
                <span>{tenant.userCount}</span>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Asaas</strong>
                  <span>
                    {tenant.asaas.checkoutReady ? "Checkout pendente" : "Monitorar webhooks"}
                  </span>
                </div>
                <span className="gm-badge gm-badge-info">homologacao</span>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Checkout</strong>
                  <span>{asaasMessage}</span>
                </div>
                <button
                  className="button secondary compact"
                  type="button"
                  disabled={busy}
                  onClick={() => void prepareCheckout()}
                >
                  Preparar
                </button>
              </div>
              <div className="status-row rich">
                <div>
                  <strong>Comunicacoes</strong>
                  <span>{communicationStatus}</span>
                </div>
                <span className="gm-badge gm-badge-info">email</span>
              </div>
              {tenant.asaas.providerSubscriptionId ? (
                <div className="status-row rich">
                  <div>
                    <strong>Referencia externa</strong>
                    <span>{tenant.asaas.providerSubscriptionId}</span>
                  </div>
                  <span className="gm-badge gm-badge-good">salva</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className="panel platform-detail-timeline">
            <div className="panel-title">
              <Activity size={20} />
              <div>
                <h2>Timeline</h2>
                <p>Ultimos eventos auditaveis do tenant.</p>
              </div>
            </div>
            <div className="audit-list">
              {tenant.timeline.map((event) => (
                <div className="status-row rich" key={event.id}>
                  <div>
                    <strong>{event.action}</strong>
                    <span>{event.entityType}</span>
                  </div>
                  <small>{new Date(event.createdAt).toLocaleString("pt-BR")}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <Mail size={20} />
              <div>
                <h2>Central de comunicacoes</h2>
                <p>Historico auditavel de mensagens comerciais e operacionais deste tenant.</p>
              </div>
            </div>
            <div className="status-list">
              {communicationEvents.length ? (
                communicationEvents.map((event) => (
                  <div className="status-row rich" key={event.id}>
                    <div>
                      <strong>{event.action.replace("platform.tenant.communication_", "")}</strong>
                      <span>{event.entityType}</span>
                    </div>
                    <small>{new Date(event.createdAt).toLocaleString("pt-BR")}</small>
                  </div>
                ))
              ) : (
                <p className="muted-copy">Nenhuma comunicacao auditada ainda para este tenant.</p>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <ShieldCheck size={20} />
              <div>
                <h2>Acoes de suporte</h2>
                <p>Registro comercial do tenant com prioridade e observacoes.</p>
              </div>
            </div>
            <div className="support-form">
              <label>
                Prioridade
                <select
                  value={supportPriority}
                  onChange={(event) => setSupportPriority(event.target.value as "normal" | "high")}
                >
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                </select>
              </label>
              <label>
                Status da fila
                <select
                  value={supportStatus}
                  onChange={(event) =>
                    setSupportStatus(
                      event.target.value as
                        | "queued"
                        | "in_progress"
                        | "waiting_customer"
                        | "resolved",
                    )
                  }
                >
                  <option value="queued">Na fila</option>
                  <option value="in_progress">Em atendimento</option>
                  <option value="waiting_customer">Aguardando cliente</option>
                  <option value="resolved">Resolvido</option>
                </select>
              </label>
              <label>
                Responsavel comercial
                <input
                  value={relationshipOwnerName}
                  onChange={(event) => setRelationshipOwnerName(event.target.value)}
                  placeholder="Quem cuida da conta"
                />
              </label>
              <label>
                E-mail do responsavel
                <input
                  type="email"
                  value={relationshipOwnerEmail}
                  onChange={(event) => setRelationshipOwnerEmail(event.target.value)}
                  placeholder="contato@giromesa.com"
                />
              </label>
              <label>
                SLA
                <select
                  value={slaTier}
                  onChange={(event) =>
                    setSlaTier(event.target.value as "standard" | "priority" | "critical")
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="priority">Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label>
                Proximo follow-up
                <input
                  type="datetime-local"
                  value={nextFollowUpAt}
                  onChange={(event) => setNextFollowUpAt(event.target.value)}
                />
              </label>
              <label>
                Notas comerciais
                <textarea
                  value={supportNotes}
                  rows={7}
                  maxLength={4000}
                  onChange={(event) => setSupportNotes(event.target.value)}
                  placeholder="Contexto comercial, riscos, follow-up, combinados e proximo contato."
                />
              </label>
              <label>
                Registrar contato
                <textarea
                  value={contactSummary}
                  rows={3}
                  maxLength={600}
                  onChange={(event) => setContactSummary(event.target.value)}
                  placeholder="Resumo curto do ultimo contato com o cliente."
                />
              </label>
              <div className="support-form-footer">
                <small>{supportNotes.trim().length}/4000 notas</small>
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveSupport()}
                >
                  Salvar notas
                </button>
              </div>
              <div className="platform-inline-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void sendCommunication("support_follow_up")}
                >
                  <Mail size={17} /> Follow-up
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void sendCommunication("trial_ending")}
                >
                  <CalendarClock size={17} /> Trial
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void sendCommunication("past_due")}
                >
                  <CreditCard size={17} /> Cobranca
                </button>
              </div>
            </div>
            <div className="support-history">
              <strong>Historico recente</strong>
              {tenant.support.contactHistory.length ? (
                tenant.support.contactHistory.map((entry) => (
                  <div className="status-row rich" key={entry.id}>
                    <div>
                      <strong>{entry.summary}</strong>
                      <span>{entry.createdBy ?? "platform"}</span>
                    </div>
                    <small>{new Date(entry.createdAt).toLocaleString("pt-BR")}</small>
                  </div>
                ))
              ) : (
                <p className="muted-copy">Sem contatos registrados ainda.</p>
              )}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
