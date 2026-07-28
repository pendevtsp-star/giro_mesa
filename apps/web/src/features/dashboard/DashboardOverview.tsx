import { AlertTriangle, BadgeDollarSign, BarChart3, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CashSessionSummary,
  CurrentShiftResponse,
  InventoryAlert,
  OnboardingStatus,
  SalesByPeriodResponse,
} from "../../lib/giromesa-api";
import { formatMoney } from "../../lib/giromesa-api";
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

export function PeriodSalesCard({ salesData }: { salesData: SalesByPeriodResponse | null }) {
  if (!salesData) {
    return null;
  }

  const { summary, topProducts } = salesData;

  return (
    <section className="panel dashboard-kpi-panel" aria-label="KPIs do periodo">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Indicadores do periodo</span>
          <h2>Resumo gerencial</h2>
        </div>
        <BarChart3 size={20} />
      </div>
      <div className="kpi-cards-grid">
        <article className="kpi-card">
          <div className="kpi-card-header">
            <BadgeDollarSign size={18} />
            <span>Vendas do periodo</span>
          </div>
          <strong className="kpi-card-value">{formatMoney(summary.totalCents)}</strong>
          <span className="kpi-card-hint">{summary.totalOrders} pedido(s) nos ultimos 7 dias</span>
        </article>

        <article className="kpi-card">
          <div className="kpi-card-header">
            <TrendingUp size={18} />
            <span>Ticket medio</span>
          </div>
          <strong className="kpi-card-value">{formatMoney(summary.averageTicketCents)}</strong>
          <span className="kpi-card-hint">por pedido no periodo</span>
        </article>
      </div>

      {topProducts.length > 0 ? (
        <div className="top-products-section">
          <span className="section-kicker">Produtos mais vendidos</span>
          <div className="top-products-list">
            {topProducts.slice(0, 5).map((product, index) => (
              <div className="top-product-row" key={product.productId ?? index}>
                <span className="top-product-rank">{index + 1}</span>
                <div className="top-product-info">
                  <strong>{product.name ?? "Produto"}</strong>
                  <span>
                    {product.quantity} un. - {formatMoney(product.revenueCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RecentAlertsSection({
  inventoryAlerts,
  cashSummary,
}: {
  inventoryAlerts: InventoryAlert[];
  cashSummary: CashSessionSummary | null;
}) {
  const alerts: Array<{ type: "inventory" | "cash"; message: string; tone: "warn" | "danger" }> =
    [];

  if (inventoryAlerts.length > 0) {
    alerts.push({
      type: "inventory",
      message: `${inventoryAlerts.length} item(ns) abaixo do estoque minimo`,
      tone: "warn",
    });
  }

  if (cashSummary?.session?.status === "open") {
    const openOrders = cashSummary.openOrders.count;
    if (openOrders > 0) {
      alerts.push({
        type: "cash",
        message: `${openOrders} conta(s) aberta(s) no caixa`,
        tone: "warn",
      });
    }
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="panel dashboard-alerts-panel" aria-label="Alertas recentes">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Atencao</span>
          <h2>Alertas recentes</h2>
        </div>
        <AlertTriangle size={20} />
      </div>
      <div className="alerts-list">
        {alerts.map((alert) => (
          <div className="alert-row" key={`${alert.type}-${alert.message}`}>
            <AlertTriangle size={16} />
            <span>{alert.message}</span>
            <Badge tone={alert.tone}>{alert.type === "inventory" ? "estoque" : "caixa"}</Badge>
          </div>
        ))}
      </div>
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
        <p>Abra o PDV para atender mesas, balcao e pagamentos sem distrair a gestao.</p>
        <a className="button primary compact" href="/app/pos">
          Abrir PDV <BadgeDollarSign size={15} />
        </a>
      </article>
      <article className="dashboard-focus-card">
        <span className="section-kicker">Producao</span>
        <strong>{ticketCount} ticket(s) em acompanhamento</strong>
        <p>
          {ticketCount
            ? "Acompanhe cozinha e bar antes de criar novo gargalo."
            : "Nenhuma fila critica no KDS agora."}
        </p>
        {ticketCount > 0 ? (
          <a className="button primary compact" href="/app/waiter">
            Acompanhar salao
          </a>
        ) : (
          <span className="gm-badge gm-badge-good">Tudo em ordem</span>
        )}
      </article>
      <article className="dashboard-focus-card">
        <span className="section-kicker">Gestao</span>
        <strong>
          {inventoryAlertCount > 0
            ? `${inventoryAlertCount} alerta(s) de estoque`
            : "Estoque em dia"}
        </strong>
        <p>
          {inventoryAlertCount > 0
            ? "Itens abaixo do minimo precisam de reposicao urgente."
            : "Relatorios, caixa e pendencias administrativas ficam disponiveis sem poluir o turno."}
        </p>
        <a className="button secondary compact" href="/app/reports">
          Ver relatorios
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
          <span className="section-kicker">Prontidao operacional</span>
          <h2>{readiness === "ready" ? "Casa pronta para operar" : "Ajustes antes do turno"}</h2>
        </div>
        <Badge tone={readiness === "ready" ? "good" : readiness === "blocked" ? "warn" : "info"}>
          {onboardingStatus?.progressPercent ?? 0}%
        </Badge>
      </div>
      <div className="readiness-grid">
        <div className="readiness-item">
          <span className="readiness-label">Onboarding</span>
          <span className="readiness-value">
            {readiness === "ready" ? "completo" : "em implantacao"}
          </span>
        </div>
        <div className="readiness-item">
          <span className="readiness-label">Turno</span>
          <span className="readiness-value">{currentShift?.shift ? "aberto" : "fechado"}</span>
        </div>
        <div className="readiness-item">
          <span className="readiness-label">Caixa</span>
          <span className="readiness-value">
            {cashSummary?.session?.status === "open" ? "aberto" : "fechado"}
          </span>
        </div>
        <div className="readiness-item">
          <span className="readiness-label">Proxima acao</span>
          <span className="readiness-value">{nextAction}</span>
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
