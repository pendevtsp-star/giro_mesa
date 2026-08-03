import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  ClipboardCheck,
  Clock3,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  CashSessionSummary,
  CurrentShiftResponse,
  DashboardSummary,
  FinancialReport,
  InventoryAlert,
  KdsTicket,
  OnboardingStatus,
  QrPendingOrder,
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

export function ExecutiveNextAction({
  profile,
  ...pendingInput
}: PendingCenterInput & { profile: OperatorProfile }) {
  const nextAction = buildNextDashboardAction(pendingInput);
  const fallbackAction = profile.actions[0];

  return (
    <section className="profile-action-strip" aria-label="Próxima ação do turno">
      <div>
        <span className="section-kicker">{nextAction ? "Próxima ação" : profile.kicker}</span>
        <strong>{nextAction?.title ?? "Operação sob controle"}</strong>
        <p>
          {nextAction
            ? `${nextAction.detail} · ${nextAction.owner} · ${nextAction.deadline}`
            : profile.description}
        </p>
      </div>
      {nextAction ? (
        <div className="profile-action-buttons">
          <a className="button primary" href={nextAction.href}>
            {nextAction.actionLabel} <ArrowRight size={15} />
          </a>
        </div>
      ) : fallbackAction ? (
        <div className="profile-action-buttons">
          <a className="button secondary" href={fallbackAction.href}>
            {fallbackAction.label} <ArrowRight size={15} />
          </a>
        </div>
      ) : null}
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

type ProfileInsight = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type ProfileDashboardInput = {
  dashboardSummary: {
    salesToday: number;
    activeOrders: number;
    occupiedTables: string;
    cashBalance: number;
    cashOpen: boolean;
  } | null;
  cashSummary: CashSessionSummary | null;
  salesPeriodData: SalesByPeriodResponse | null;
  inventoryAlerts: InventoryAlert[];
  qrPendingOrders: QrPendingOrder[];
  tickets: KdsTicket[];
  canManageTenant: boolean;
  canManageApprovals: boolean;
  canManageCash: boolean;
  canManageInventory: boolean;
  canOperatePos: boolean;
  canOperateKds: boolean;
  occupiedLabel: string;
  financialReport: FinancialReport | null;
};

export function buildProfileInsights(input: ProfileDashboardInput): ProfileInsight[] {
  const activeTickets = input.tickets.filter(
    (ticket) => !["ready", "served"].includes(ticket.status),
  ).length;
  if (input.canManageTenant) {
    const marginPercent = input.financialReport?.dre.operationalMarginPercent;
    const marginCents = input.financialReport?.dre.operationalMarginCents ?? 0;
    return [
      {
        id: "sales",
        label: "Vendas hoje",
        value: input.dashboardSummary ? formatMoney(input.dashboardSummary.salesToday) : "R$ 0,00",
        detail: input.salesPeriodData
          ? `${input.salesPeriodData.summary.totalOrders} pedido(s) nos últimos 7 dias`
          : "Sem dados do período",
      },
      {
        id: "cash",
        label: "Caixa atual",
        value: input.dashboardSummary ? formatMoney(input.dashboardSummary.cashBalance) : "R$ 0,00",
        detail: input.dashboardSummary?.cashOpen ? "Aberto e conciliando" : "Fechado",
      },
      {
        id: "margin",
        label: "Margem operacional",
        value:
          typeof marginPercent === "number"
            ? `${marginPercent.toFixed(1)}%`
            : formatMoney(marginCents),
        detail: "Receita menos custos operacionais",
      },
      {
        id: "occupancy",
        label: "Ocupação",
        value: input.occupiedLabel,
        detail: "Mesas ocupadas agora",
      },
      {
        id: "alerts",
        label: "Alertas operacionais",
        value: String(input.inventoryAlerts.length + input.qrPendingOrders.length),
        detail: `${input.inventoryAlerts.length} estoque · ${input.qrPendingOrders.length} QR em revisão`,
      },
      {
        id: "production",
        label: "Produção",
        value: String(activeTickets),
        detail: activeTickets ? "Ticket(s) em estações" : "Fila sem tickets ativos",
      },
      {
        id: "inventory",
        label: "Estoque",
        value: String(input.inventoryAlerts.length),
        detail: input.inventoryAlerts.length ? "Reposição necessária" : "Sem alertas de mínimo",
      },
    ];
  }

  if (input.canManageApprovals) {
    return [
      {
        id: "service",
        label: "Atendimento",
        value: String(input.dashboardSummary?.activeOrders ?? 0),
        detail: "Pedido(s) em andamento",
      },
      {
        id: "qr",
        label: "Pedidos QR",
        value: String(input.qrPendingOrders.length),
        detail: "Aguardando revisão da equipe",
      },
      {
        id: "production",
        label: "Produção",
        value: String(activeTickets),
        detail: "Ticket(s) em estações",
      },
      {
        id: "inventory",
        label: "Estoque",
        value: String(input.inventoryAlerts.length),
        detail: "Alerta(s) abaixo do mínimo",
      },
    ];
  }

  if (input.canManageCash) {
    return [
      {
        id: "cash-status",
        label: "Status do caixa",
        value: input.cashSummary?.session?.status === "open" ? "Aberto" : "Fechado",
        detail: "Sessão financeira atual",
      },
      {
        id: "received",
        label: "Recebido",
        value: formatMoney(input.cashSummary?.payments.totalCents ?? 0),
        detail: `${input.cashSummary?.payments.count ?? 0} pagamento(s) confirmado(s)`,
      },
      {
        id: "open-orders",
        label: "Contas abertas",
        value: String(input.cashSummary?.openOrders.count ?? 0),
        detail: "Acompanhar antes do fechamento",
      },
    ];
  }

  if (input.canOperateKds) {
    return [
      {
        id: "production",
        label: "Fila de produção",
        value: String(activeTickets),
        detail: "Ticket(s) ativos nas estações",
      },
      {
        id: "qr",
        label: "Pedidos QR",
        value: String(input.qrPendingOrders.length),
        detail: "Aguardando encaminhamento",
      },
    ];
  }

  if (input.canOperatePos) {
    return [
      {
        id: "service",
        label: "Atendimento",
        value: String(input.dashboardSummary?.activeOrders ?? 0),
        detail: "Pedido(s) em andamento",
      },
      {
        id: "occupancy",
        label: "Mesas ocupadas",
        value: input.occupiedLabel,
        detail: "Visão atual do salão",
      },
    ];
  }

  if (input.canManageInventory) {
    return [
      {
        id: "inventory",
        label: "Alertas de estoque",
        value: String(input.inventoryAlerts.length),
        detail: "Itens que precisam de reposição",
      },
    ];
  }

  return [];
}

export function ProfileDashboardPanel(props: ProfileDashboardInput) {
  const insights = buildProfileInsights(props);
  if (insights.length === 0) return null;

  const title = props.canManageTenant
    ? "Saúde do negócio"
    : props.canManageApprovals
      ? "Visão do gerente"
      : props.canManageCash
        ? "Resumo do caixa"
        : props.canOperateKds
          ? "Produção agora"
          : props.canOperatePos
            ? "Atendimento agora"
            : "Resumo do estoque";

  return (
    <section className="profile-dashboard-panel" aria-label={title}>
      <div className="panel-title">
        <div>
          <span className="section-kicker">Resumo por perfil</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="profile-insights-grid">
        {insights.map((insight) => (
          <article className="profile-insight-card" key={insight.id}>
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
            <small>{insight.detail}</small>
          </article>
        ))}
      </div>
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

      {summary.totalOrders > 0 && topProducts.length > 0 ? (
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
      ) : (
        <p className="muted-copy">Nenhuma venda concluída nos últimos 7 dias.</p>
      )}
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
  canOperatePos,
  canOperateKds,
  canReadReports,
  canManageInventory,
}: {
  activeOrderCount: number;
  ticketCount: number;
  inventoryAlertCount: number;
  canOperatePos: boolean;
  canOperateKds: boolean;
  canReadReports: boolean;
  canManageInventory: boolean;
}) {
  if (!canOperatePos && !canOperateKds && !canReadReports && !canManageInventory) {
    return null;
  }

  return (
    <section className="dashboard-command-center" aria-label="Prioridades do turno">
      {canOperatePos ? (
        <article className="dashboard-focus-card">
          <span className="section-kicker">Atendimento</span>
          <strong>{activeOrderCount} pedido(s) em andamento</strong>
          <p>Abra o PDV para atender mesas, balcao e pagamentos sem distrair a gestao.</p>
          <a className="button primary compact" href="/app/pos">
            Abrir PDV <BadgeDollarSign size={15} />
          </a>
        </article>
      ) : null}
      {canOperateKds ? (
        <article className="dashboard-focus-card">
          <span className="section-kicker">Producao</span>
          <strong>{ticketCount} ticket(s) em acompanhamento</strong>
          <p>
            {ticketCount
              ? "Acompanhe cozinha e bar antes de criar novo gargalo."
              : "Nenhuma fila critica no KDS agora."}
          </p>
          <a className="button primary compact" href="/app/kds">
            Abrir KDS
          </a>
        </article>
      ) : null}
      {canReadReports || canManageInventory ? (
        <article className="dashboard-focus-card">
          <span className="section-kicker">Gestao</span>
          <strong>
            {canManageInventory && inventoryAlertCount > 0
              ? `${inventoryAlertCount} alerta(s) de estoque`
              : "Indicadores disponíveis"}
          </strong>
          <p>
            {canManageInventory && inventoryAlertCount > 0
              ? "Itens abaixo do minimo precisam de reposicao urgente."
              : "Acompanhe os indicadores liberados para o seu perfil."}
          </p>
          <a
            className="button secondary compact"
            href={canReadReports ? "/app/reports" : "/app/inventory"}
          >
            {canReadReports ? "Ver relatórios" : "Ver estoque"}
          </a>
        </article>
      ) : null}
    </section>
  );
}

type PendingAction = {
  id: string;
  title: string;
  detail: string;
  owner: string;
  deadline: string;
  href: string;
  actionLabel: string;
  tone: "danger" | "warn" | "info";
};

export type PendingCenterInput = {
  onboardingStatus: OnboardingStatus | null;
  currentShift: CurrentShiftResponse | null;
  cashSummary: CashSessionSummary | null;
  inventoryAlerts: InventoryAlert[];
  qrPendingOrders: QrPendingOrder[];
  tickets: KdsTicket[];
  canManageTenant: boolean;
  canManageCash: boolean;
  canManageInventory: boolean;
  canOperatePos: boolean;
  canOperateKds: boolean;
};

export function buildPendingActions({
  onboardingStatus,
  currentShift,
  cashSummary,
  inventoryAlerts,
  qrPendingOrders,
  tickets,
  canManageTenant,
  canManageCash,
  canManageInventory,
  canOperatePos,
  canOperateKds,
}: PendingCenterInput): PendingAction[] {
  const actions: PendingAction[] = [];
  const activeTickets = tickets.filter((ticket) => !["ready", "served"].includes(ticket.status));

  if (canManageTenant && onboardingStatus && onboardingStatus.readiness !== "ready") {
    actions.push({
      id: "onboarding",
      title: "Concluir preparacao da unidade",
      detail:
        onboardingStatus.nextStep?.title ??
        `${onboardingStatus.blockers.length} dependência(s) impedem a prontidao`,
      owner: "Gestao",
      deadline: "Antes de abrir",
      href: "/app/onboarding",
      actionLabel: "Abrir onboarding",
      tone: "warn",
    });
  }

  if (canManageCash && !currentShift?.shift) {
    actions.push({
      id: "shift",
      title: "Abrir o turno",
      detail: "Registre a abertura para liberar a operacao e a conciliacao.",
      owner: "Caixa",
      deadline: "Agora",
      href: "/app/cash",
      actionLabel: "Abrir turno",
      tone: "danger",
    });
  }

  if (canManageCash && cashSummary?.session?.status !== "open") {
    actions.push({
      id: "cash",
      title: "Abrir o caixa",
      detail: "Defina o fundo de troco antes de receber pagamentos.",
      owner: "Caixa",
      deadline: "Antes de vender",
      href: "/app/cash",
      actionLabel: "Abrir caixa",
      tone: "danger",
    });
  }

  if (canOperatePos && qrPendingOrders.length > 0) {
    actions.push({
      id: "qr-orders",
      title: `${qrPendingOrders.length} pedido(s) QR aguardando revisao`,
      detail: "Confira mesa e itens antes de liberar para a producao.",
      owner: "Atendimento",
      deadline: "Agora",
      href: "/app/pos?queue=qr",
      actionLabel: "Revisar pedidos",
      tone: "warn",
    });
  }

  if (canOperateKds && activeTickets.length > 0) {
    actions.push({
      id: "kds",
      title: `${activeTickets.length} ticket(s) em producao`,
      detail: "Acompanhe atrasos, alteracoes e cancelamentos nas estacoes.",
      owner: "Producao",
      deadline: "Agora",
      href: "/app/kds",
      actionLabel: "Abrir KDS",
      tone: "warn",
    });
  }

  if (canManageInventory && inventoryAlerts.length > 0) {
    actions.push({
      id: "inventory",
      title: `${inventoryAlerts.length} alerta(s) de estoque`,
      detail: "Itens abaixo do minimo podem interromper o turno.",
      owner: "Estoque",
      deadline: "Hoje",
      href: "/app/inventory",
      actionLabel: "Ver estoque",
      tone: "info",
    });
  }

  if (canManageCash && cashSummary?.openOrders.count) {
    actions.push({
      id: "open-orders",
      title: `${cashSummary.openOrders.count} conta(s) ainda aberta(s)`,
      detail: "Acompanhe recebimentos e evite encerrar o caixa com saldo pendente.",
      owner: "Caixa",
      deadline: "Fechamento",
      href: "/app/cash",
      actionLabel: "Conferir contas",
      tone: "info",
    });
  }

  return actions;
}

export function buildNextDashboardAction(input: PendingCenterInput): PendingAction | null {
  return buildPendingActions(input)[0] ?? null;
}

export function PendingCenter(props: PendingCenterInput) {
  const actions = buildPendingActions(props);

  return (
    <section className="dashboard-pending-center" aria-label="Central de pendencias">
      <div className="dashboard-pending-heading">
        <div>
          <span className="section-kicker">
            <ClipboardCheck size={15} /> Central de pendencias
          </span>
          <h2>{actions.length ? `${actions.length} proxima(s) acao(oes)` : "Tudo em ordem"}</h2>
        </div>
        <Clock3 size={19} aria-hidden="true" />
      </div>
      {actions.length ? (
        <div className="dashboard-pending-list">
          {actions.map((action) => (
            <article className={`dashboard-pending-row tone-${action.tone}`} key={action.id}>
              <div className="dashboard-pending-copy">
                <strong>{action.title}</strong>
                <span>{action.detail}</span>
              </div>
              <div className="dashboard-pending-meta">
                <span>{action.owner}</span>
                <span>{action.deadline}</span>
              </div>
              <a className="button secondary compact" href={action.href}>
                {action.actionLabel} <ArrowRight size={14} />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="dashboard-pending-empty">
          Nao ha pendencias criticas para o seu perfil neste momento.
        </p>
      )}
    </section>
  );
}

export type BranchDashboardSummary = {
  id: string;
  name: string;
  summary: DashboardSummary;
};

export function BranchComparisonCard({ rows }: { rows: BranchDashboardSummary[] }) {
  if (rows.length < 2) return null;

  return (
    <section className="panel dashboard-branch-comparison" aria-label="Comparação entre filiais">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Multiunidade</span>
          <h2>Comparação entre filiais</h2>
        </div>
        <BarChart3 size={20} aria-hidden="true" />
      </div>
      <div className="dashboard-branch-table-wrap">
        <table className="dashboard-branch-table">
          <thead>
            <tr>
              <th scope="col">Filial</th>
              <th scope="col">Vendas hoje</th>
              <th scope="col">Pedidos</th>
              <th scope="col">Mesas</th>
              <th scope="col">Caixa</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((left, right) => right.summary.salesToday - left.summary.salesToday)
              .map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  <td>{formatMoney(row.summary.salesToday)}</td>
                  <td>{row.summary.activeOrders}</td>
                  <td>{row.summary.occupiedTables}</td>
                  <td>{formatMoney(row.summary.cashBalance)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OperationalReadinessPanel({
  onboardingStatus,
  currentShift,
  cashSummary,
  onOpenPos,
  canManageOnboarding,
  canManageCash,
  canOpenPos,
}: {
  onboardingStatus: OnboardingStatus | null;
  currentShift: CurrentShiftResponse | null;
  cashSummary: CashSessionSummary | null;
  onOpenPos: () => void;
  canManageOnboarding: boolean;
  canManageCash: boolean;
  canOpenPos: boolean;
}) {
  const readiness = onboardingStatus?.readiness ?? "pending";
  const nextAction =
    canManageOnboarding && readiness !== "ready"
      ? "concluir onboarding"
      : canManageCash && !currentShift?.shift
        ? "abrir turno"
        : canManageCash && cashSummary?.session?.status !== "open"
          ? "abrir caixa"
          : canOpenPos
            ? "operar PDV"
            : "acompanhar operação";

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
        {canManageOnboarding ? (
          <div className="readiness-item">
            <span className="readiness-label">Onboarding</span>
            <span className="readiness-value">
              {readiness === "ready" ? "completo" : "em implantacao"}
            </span>
          </div>
        ) : null}
        {canManageCash ? (
          <>
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
          </>
        ) : null}
        <div className="readiness-item">
          <span className="readiness-label">Proxima acao</span>
          <span className="readiness-value">{nextAction}</span>
        </div>
      </div>
      <div className="ticket-actions">
        {canManageOnboarding && readiness !== "ready" ? (
          <a className="button secondary compact" href="/app/onboarding">
            Abrir onboarding
          </a>
        ) : null}
        {canManageCash && (!currentShift?.shift || cashSummary?.session?.status !== "open") ? (
          <a className="button primary compact" href="/app/cash">
            Turno e caixa
          </a>
        ) : canOpenPos ? (
          <button className="button primary compact" type="button" onClick={onOpenPos}>
            Abrir PDV
          </button>
        ) : null}
      </div>
    </section>
  );
}
