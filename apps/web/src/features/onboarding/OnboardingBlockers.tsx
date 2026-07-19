import { AlertTriangle } from "lucide-react";
import type { OnboardingStatus } from "../../lib/giromesa-api";

export function OnboardingBlockers({ blockers }: { blockers: OnboardingStatus["blockers"] }) {
  if (!blockers.length) {
    return (
      <section className="onboarding-note">
        <AlertTriangle size={20} />
        <p>
          <strong>Sem bloqueios críticos:</strong> siga com o pedido de teste e abertura de turno.
        </p>
      </section>
    );
  }
  return (
    <section className="onboarding-note warning">
      <AlertTriangle size={20} />
      <div>
        <strong>Bloqueios antes do go-live</strong>
        {blockers.map((blocker) => (
          <p key={blocker.key}>{blocker.label}</p>
        ))}
      </div>
    </section>
  );
}
