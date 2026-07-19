import { Badge } from "@giromesa/ui";
import { ArrowRight, CheckCircle2, Circle, PlayCircle, SkipForward } from "lucide-react";
import type { OnboardingStep } from "../../lib/giromesa-api";

type OnboardingStepListProps = {
  steps: OnboardingStep[];
  busyStep: string | null;
  onStart: (stepKey: string) => void;
  onComplete: (stepKey: string) => void;
  onSkip: (stepKey: string) => void;
};

const toneByStatus = {
  pending: "neutral",
  in_progress: "info",
  completed: "good",
  skipped: "warn",
  blocked: "danger",
} as const;

const labelByStatus = {
  pending: "pendente",
  in_progress: "em andamento",
  completed: "concluída",
  skipped: "ignorada",
  blocked: "bloqueada",
} as const;

export function OnboardingStepList({
  steps,
  busyStep,
  onStart,
  onComplete,
  onSkip,
}: OnboardingStepListProps) {
  return (
    <section className="onboarding-list">
      {steps.map((step, index) => {
        const done = step.status === "completed" || step.status === "skipped";
        const busy = busyStep === step.key;
        return (
          <article className={done ? "onboarding-step complete" : "onboarding-step"} key={step.key}>
            <span className="onboarding-step-icon">
              {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </span>
            <div>
              <span>Etapa {index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
              {step.blockedReason ? <small>{step.blockedReason}</small> : null}
            </div>
            <div className="onboarding-step-actions">
              <Badge tone={toneByStatus[step.status]}>{labelByStatus[step.status]}</Badge>
              {step.status === "pending" ? (
                <button
                  className="button ghost compact"
                  type="button"
                  disabled={busy}
                  onClick={() => onStart(step.key)}
                >
                  <PlayCircle size={15} /> Iniciar
                </button>
              ) : null}
              {!done ? (
                <button
                  className="button secondary compact"
                  type="button"
                  disabled={busy}
                  onClick={() => onComplete(step.key)}
                >
                  Concluir
                </button>
              ) : null}
              {step.skippable && !done ? (
                <button
                  className="button ghost compact"
                  type="button"
                  disabled={busy}
                  onClick={() => onSkip(step.key)}
                >
                  <SkipForward size={15} /> Ignorar
                </button>
              ) : null}
              <a className="button secondary compact" href={step.href}>
                Abrir <ArrowRight size={15} />
              </a>
            </div>
          </article>
        );
      })}
    </section>
  );
}
