import { BadgeDollarSign } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CashSessionSummary,
  CurrentShiftResponse,
  OnboardingStatus,
} from "../../lib/giromesa-api";
import type { DashboardMetric, OperatorProfile } from "./dashboard-types";

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

export function ProfileActionStrip({ profile }: { profile: OperatorProfile }) {
  return (
    <section className="profile-action-strip" aria-label="Atalhos por perfil">
      <div>
        <span className="section-kicker">{profile.kicker}</span>
        <strong>{profile.title}</strong>
        <p>{profile.description}</p>
      </div>
      <div className="profile-action-buttons">
        {profile.actions.map((action) => (
          <a className="button secondary" href={action.href} key={action.href}>
            {action.label}
          </a>
        ))}
      </div>
    </section>
  );
}

export function OperationalSummaryCards({
  metrics,
  compact = false,
}: {
  metrics: readonly DashboardMetric[];
  compact?: boolean;
}) {
  return (
    <section className={compact ? "metrics compact" : "metrics compact dashboard-metrics"}>
      {metrics.map(([label, value, hint], index) => (
        <article className="metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <Badge tone={index === 1 ? "info" : index === 3 ? "good" : "neutral"}>{hint}</Badge>
        </article>
      ))}
    </section>
  );
}

export function ShiftPriorities({
  activeOrderCount,
  ticketCount,
  inventoryAlertCount,
}: {
  activeOrderCount: number;
  ticketCount: number;
  inventoryAlertCount: number;
}) {
  return (
    <section className="dashboard-command-center" aria-label="Prioridades do turno">
      <article className="dashboard-focus-card">
        <span className="section-kicker">Atendimento</span>
        <strong>{activeOrderCount} pedido(s) em andamento</strong>
        <p>Abra o PDV para atender mesas, balcão e pagamentos sem distrair a gestão.</p>
        <a className="button primary compact" href="/app?view=pos">
          Ir para o PDV <BadgeDollarSign size={15} />
        </a>
      </article>
      <article className="dashboard-focus-card">
        <span className="section-kicker">Produção</span>
        <strong>{ticketCount} ticket(s) em acompanhamento</strong>
        <p>
          {ticketCount
            ? "Acompanhe cozinha e bar antes de criar novo gargalo."
            : "Nenhuma fila crítica no KDS agora."}
        </p>
        <a className="button secondary compact" href="/app/waiter">
          Acompanhar salão
        </a>
      </article>
      <article className="dashboard-focus-card">
        <span className="section-kicker">Gestão</span>
        <strong>{inventoryAlertCount} alerta(s) de estoque</strong>
        <p>Relatórios, caixa e pendências administrativas ficam disponíveis sem poluir o turno.</p>
        <a className="button secondary compact" href="/app/reports">
          Ver relatórios
        </a>
      </article>
    </section>
  );
}

export function OperationalReadinessPanel({
  onboardingStatus,
  currentShift,
  cashSummary,
  onOpenPos,
}: {
  onboardingStatus: OnboardingStatus | null;
  currentShift: CurrentShiftResponse | null;
  cashSummary: CashSessionSummary | null;
  onOpenPos: () => void;
}) {
  const readiness = onboardingStatus?.readiness ?? "pending";
  const nextAction =
    readiness !== "ready"
      ? "concluir onboarding"
      : !currentShift?.shift
        ? "abrir turno"
        : cashSummary?.session?.status !== "open"
          ? "abrir caixa"
          : "operar PDV";

  return (
    <section className="panel operational-readiness-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Prontidão operacional</span>
          <h2>{readiness === "ready" ? "Casa pronta para operar" : "Ajustes antes do turno"}</h2>
        </div>
        <Badge tone={readiness === "ready" ? "good" : readiness === "blocked" ? "warn" : "info"}>
          {onboardingStatus?.progressPercent ?? 0}%
        </Badge>
      </div>
      <div className="cash-grid readiness-grid">
        <div>
          <span>Onboarding</span>
          <strong>{readiness === "ready" ? "completo" : "em implantação"}</strong>
        </div>
        <div>
          <span>Turno</span>
          <strong>{currentShift?.shift ? "aberto" : "fechado"}</strong>
        </div>
        <div>
          <span>Caixa</span>
          <strong>{cashSummary?.session?.status === "open" ? "aberto" : "fechado"}</strong>
        </div>
        <div>
          <span>Próxima ação</span>
          <strong>{nextAction}</strong>
        </div>
      </div>
      <div className="ticket-actions">
        {readiness !== "ready" ? (
          <a className="button secondary compact" href="/app/onboarding">
            Abrir onboarding
          </a>
        ) : null}
        {!currentShift?.shift || cashSummary?.session?.status !== "open" ? (
          <a className="button primary compact" href="/app/cash">
            Turno e caixa
          </a>
        ) : (
          <button className="button primary compact" type="button" onClick={onOpenPos}>
            Abrir PDV
          </button>
        )}
      </div>
    </section>
  );
}
