"use client";

import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getSession,
  getTenantBranding,
  type TenantBranding,
  type TenantSession,
} from "../../../lib/giromesa-api";

const fallbackBranding: TenantBranding = {
  displayName: "GiroMesa",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

function billingStatusLabel(status?: TenantSession["billing"]) {
  if (!status) {
    return "Status indisponível";
  }
  const labels = {
    healthy: "Assinatura ativa",
    trial_ok: "Teste grátis ativo",
    trial_ending: "Teste grátis perto do fim",
    payment_required: "Ativação necessária",
    access_blocked: "Acesso bloqueado",
  } as const;
  return labels[status.status];
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Sem data definida";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default function BillingPage() {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [branding, setBranding] = useState<TenantBranding>(fallbackBranding);
  const [status, setStatus] = useState("Carregando assinatura...");

  useEffect(() => {
    Promise.all([getSession(), getTenantBranding()])
      .then(([sessionPayload, brandingPayload]) => {
        setSession(sessionPayload);
        setBranding(brandingPayload);
        setStatus("Assinatura carregada.");
      })
      .catch((error) => {
        const message =
          error instanceof ApiError && error.status === 401
            ? "Entre no painel para acompanhar sua assinatura."
            : "Não foi possível carregar os dados de assinatura agora.";
        setStatus(message);
      });
  }, []);

  const billing = session?.billing;
  const daysRemaining = billing?.trialDaysRemaining ?? null;
  const statusTone = useMemo(() => {
    if (billing?.status === "healthy" || billing?.status === "trial_ok") {
      return "gm-badge-good";
    }
    if (billing?.status === "trial_ending") {
      return "gm-badge-warn";
    }
    return "gm-badge-danger";
  }, [billing?.status]);
  const commercialEmail = "comercial@giromesa.com.br";
  const activationSubject = encodeURIComponent(`Ativar assinatura - ${branding.displayName}`);
  const activationBody = encodeURIComponent(
    `Olá, quero ativar a assinatura do GiroMesa para ${branding.displayName}.\n\nTenant: ${
      session?.tenantId ?? "não carregado"
    }\nStatus atual: ${billingStatusLabel(billing)}`,
  );

  return (
    <main
      className="billing-page"
      data-theme={branding.themeMode}
      data-accent={branding.accentPreset}
    >
      <header className="billing-hero">
        <a className="button ghost" href="/app">
          <ArrowLeft size={18} /> Voltar ao painel
        </a>
        <div>
          <span className="section-kicker">Assinatura</span>
          <h1>Assinatura GiroMesa</h1>
          <p>
            Acompanhe o teste grátis, prepare a ativação comercial e mantenha a operação sem
            interrupção depois dos 7 dias.
          </p>
        </div>
        <span className={`gm-badge ${statusTone}`}>{billingStatusLabel(billing)}</span>
      </header>

      <section className="billing-grid">
        <article className="panel billing-status-card">
          <div className="panel-title">
            <CalendarClock size={20} />
            <div>
              <h2>Janela comercial</h2>
              <p>{status}</p>
            </div>
          </div>
          <div className="billing-metrics">
            <div>
              <span>Dias restantes</span>
              <strong>{daysRemaining ?? "-"}</strong>
            </div>
            <div>
              <span>Fim do período</span>
              <strong>{formatDate(billing?.currentPeriodEndsAt)}</strong>
            </div>
            <div>
              <span>Status do tenant</span>
              <strong>{billing?.tenantStatus ?? "indefinido"}</strong>
            </div>
          </div>
        </article>

        <article className="panel billing-activation-card">
          <div className="panel-title">
            <CreditCard size={20} />
            <div>
              <h2>Ativação da cobrança</h2>
              <p>Sem cartão no cadastro inicial. A cobrança começa apenas após o período grátis.</p>
            </div>
          </div>
          <div className="billing-steps">
            <div>
              <BadgeCheck size={18} />
              <span>Confirmar plano e dados fiscais do estabelecimento.</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>
                Gerar checkout hospedado Asaas quando as credenciais estiverem configuradas.
              </span>
            </div>
            <div>
              <CreditCard size={18} />
              <span>Ativar Pix, cartão ou boleto para continuidade do serviço.</span>
            </div>
          </div>
          <a
            className="button primary"
            href={`mailto:${commercialEmail}?subject=${activationSubject}&body=${activationBody}`}
          >
            Solicitar ativação <ExternalLink size={18} />
          </a>
        </article>

        <article className="panel billing-note">
          <span className="section-kicker">Pronto para Asaas</span>
          <h2>O fluxo técnico já fica preparado</h2>
          <p>
            Enquanto as credenciais reais não entram, esta tela funciona como central comercial:
            mostra prazo, risco de bloqueio e orienta o cliente a ativar a assinatura sem confundir
            teste grátis com ambiente fictício.
          </p>
        </article>

        <article className="panel billing-note">
          <span className="section-kicker">Continuidade</span>
          <h2>Sem cartão no teste. Sem surpresa depois.</h2>
          <p>
            Durante os 7 dias, o estabelecimento valida salão, PDV, KDS, QR, caixa e relatórios. Ao
            final, o acesso operacional fica preservado e a ativação comercial libera a continuidade
            com cobrança recorrente.
          </p>
        </article>
      </section>
    </main>
  );
}
