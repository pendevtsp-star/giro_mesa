"use client";

import { ArrowLeft, RotateCw, ShieldCheck } from "lucide-react";
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
