import { BadgeDollarSign } from "lucide-react";
import type { ReactNode } from "react";
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
