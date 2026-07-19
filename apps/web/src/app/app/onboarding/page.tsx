"use client";

import {
  ArrowLeft,
  BadgeDollarSign,
  ClipboardCheck,
  Palette,
  Printer,
  QrCode,
  RotateCw,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { useState } from "react";
import { OnboardingBlockers } from "../../../features/onboarding/OnboardingBlockers";
import { OnboardingProgressCard } from "../../../features/onboarding/OnboardingProgressCard";
import { OnboardingStepList } from "../../../features/onboarding/OnboardingStepList";
import { useOnboardingStatus } from "../../../lib/hooks/useOnboardingStatus";

export default function OnboardingPage() {
  const onboarding = useOnboardingStatus();
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [message, setMessage] = useState("Checklist carregando...");

  async function runStepAction(stepKey: string, action: "start" | "complete" | "skip") {
    setBusyStep(stepKey);
    try {
      if (action === "start") await onboarding.startStep(stepKey);
      if (action === "complete") await onboarding.completeStep(stepKey);
      if (action === "skip") await onboarding.skipStep(stepKey);
      setMessage("Progresso salvo com auditoria.");
    } catch {
      setMessage("Não foi possível atualizar a etapa. Confira sua permissão.");
    } finally {
      setBusyStep(null);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>
      {onboarding.data ? (
        <>
          <OnboardingProgressCard status={onboarding.data} />
          <section className="onboarding-welcome panel">
            <div>
              <span className="section-kicker">Primeiros 30 minutos</span>
              <h2>Configure o mínimo para testar com uma mesa real.</h2>
              <p>
                O GiroMesa fica mais convincente quando o restaurante vê o próprio cardápio, uma
                mesa aberta, um pedido na cozinha e o fechamento do caixa no mesmo roteiro.
              </p>
            </div>
            <div className="onboarding-quick-grid">
              <a href="/app/settings/branding">
                <Palette size={18} />
                <strong>Identidade</strong>
                <span>Logo, tema e cor do estabelecimento.</span>
              </a>
              <a href="/app/salon">
                <Store size={18} />
                <strong>Salão</strong>
                <span>Mesas, setores e mapa visual.</span>
              </a>
              <a href="/app?view=pos">
                <ClipboardCheck size={18} />
                <strong>Pedido teste</strong>
                <span>Abrir comanda, enviar KDS e receber.</span>
              </a>
              <a href="/app/printing">
                <Printer size={18} />
                <strong>Impressão</strong>
                <span>Rotas, conector e comprovantes.</span>
              </a>
              <a href="/app/team">
                <Users size={18} />
                <strong>Equipe</strong>
                <span>Permissões para dono, caixa e garçom.</span>
              </a>
              <a href="/app/billing">
                <BadgeDollarSign size={18} />
                <strong>Assinatura</strong>
                <span>Trial, ativação e continuidade.</span>
              </a>
            </div>
            <a className="button primary compact" href="/q/M03">
              <QrCode size={16} /> Ver QR de exemplo
            </a>
          </section>
          <section className="onboarding-progress" aria-label="Progresso da implantação">
            <span style={{ width: `${onboarding.data.progressPercent}%` }} />
          </section>
          <div className="onboarding-command-row">
            <p>{message}</p>
            <button
              className="button secondary compact"
              type="button"
              disabled={onboarding.isLoading}
              onClick={() => {
                void onboarding.recalculate().then(() => setMessage("Readiness recalculado."));
              }}
            >
              <RotateCw size={15} /> Recalcular readiness
            </button>
          </div>
          <OnboardingBlockers blockers={onboarding.data.blockers} />
          {onboarding.data.nextStep ? (
            <section className="onboarding-note">
              <ShieldCheck size={20} />
              <p>
                <strong>Próxima ação:</strong> {onboarding.data.nextStep.title}.{" "}
                {onboarding.data.nextStep.description}
              </p>
            </section>
          ) : null}
          <OnboardingStepList
            steps={onboarding.data.steps}
            busyStep={busyStep}
            onStart={(stepKey) => void runStepAction(stepKey, "start")}
            onComplete={(stepKey) => void runStepAction(stepKey, "complete")}
            onSkip={(stepKey) => void runStepAction(stepKey, "skip")}
          />
        </>
      ) : (
        <section className="onboarding-note">
          <ShieldCheck size={20} />
          <p>
            <strong>{onboarding.error ? "Onboarding indisponível" : "Carregando"}</strong>{" "}
            {onboarding.error ?? "Lendo configuração operacional do estabelecimento."}
          </p>
        </section>
      )}
    </main>
  );
}
