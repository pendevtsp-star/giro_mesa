import { Badge } from "@giromesa/ui";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import type { OnboardingStatus } from "../../lib/giromesa-api";

export function OnboardingProgressCard({ status }: { status: OnboardingStatus }) {
  const ready = status.readiness === "ready";
  return (
    <section className="onboarding-hero">
      <div>
        <span className="section-kicker">Implantação guiada</span>
        <h1>
          {ready ? "A casa está pronta para operar." : "Prepare a casa para o primeiro turno."}
        </h1>
        <p>
          {ready
            ? "Checklist essencial concluído. Agora é hora de validar o turno real com a equipe."
            : "Siga o roteiro operacional para sair da configuração e entrar em rotina auditável."}
        </p>
      </div>
      <aside>
        {ready ? <BadgeCheck size={24} /> : <ShieldAlert size={24} />}
        <strong>{status.progressPercent}%</strong>
        <span>
          {status.completedSteps} de {status.totalSteps} etapas
        </span>
        <Badge tone={ready ? "good" : status.readiness === "blocked" ? "warn" : "info"}>
          {ready ? "pronto" : status.readiness === "blocked" ? "bloqueado" : "em andamento"}
        </Badge>
      </aside>
    </section>
  );
}
