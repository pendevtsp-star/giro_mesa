"use client";

import {
  Banknote,
  Boxes,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Gauge,
  type LayoutDashboard,
  MapPinned,
  Palette,
  Printer,
  QrCode,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell/AppShell";
import { filterNavigationByPermissions } from "../../components/app-shell/navigation";
import {
  OperationalReadinessPanel,
  OperationalSummaryCards,
  PendingCenter,
  PeriodSalesCard,
  ProfileActionStrip,
  RecentAlertsSection,
} from "../../features/dashboard/DashboardOverview";
import type { AppStatus, DashboardMetric } from "../../features/dashboard/dashboard-types";
import { readOperatorProfile, readStatusTitle } from "../../lib/formatters/app-dashboard";
import {
  type ApiError,
  type CashSessionSummary,
  type CurrentShiftResponse,
  type DiningTable,
  formatMoney,
  getCashSessionSummary,
  getCurrentShift,
  getDashboardSummary,
  getOnboardingStatus,
  getSalesByPeriod,
  getSession,
  getTenantBranding,
  type InventoryAlert,
  type KdsTicket,
  listInventoryAlerts,
  listKdsTickets,
  listQrPendingOrders,
  listTables,
  logout,
  type OnboardingStatus,
  type QrPendingOrder,
  type SalesByPeriodResponse,
  type TenantBranding,
  type TenantSession,
} from "../../lib/giromesa-api";
import { useTranslation } from "../../lib/i18n";

type QuickLink = {
  icon: typeof LayoutDashboard;
  labelKey: string;
  href: string;
  color: string;
};

const quickLinks: QuickLink[] = [
  { icon: ClipboardList, labelKey: "nav.pos", href: "/app/pos", color: "#10b981" },
  { icon: MapPinned, labelKey: "nav.salon", href: "/app/salon", color: "#3b82f6" },
  { icon: ChefHat, labelKey: "nav.kds", href: "/app/kds", color: "#f59e0b" },
  { icon: Boxes, labelKey: "nav.inventory", href: "/app/inventory", color: "#8b5cf6" },
  { icon: Banknote, labelKey: "nav.cash", href: "/app/cash", color: "#ef4444" },
  { icon: CreditCard, labelKey: "nav.reports", href: "/app/reports", color: "#06b6d4" },
  { icon: QrCode, labelKey: "nav.catalog", href: "/app/catalog", color: "#ec4899" },
  { icon: Printer, labelKey: "nav.printing", href: "/app/printing", color: "#6366f1" },
  { icon: FileCheck2, labelKey: "nav.fiscal", href: "/app/fiscal", color: "#14b8a6" },
  { icon: Gauge, labelKey: "nav.outbox", href: "/app/outbox", color: "#f97316" },
  { icon: ShieldCheck, labelKey: "nav.audit", href: "/app/audit", color: "#64748b" },
  { icon: Users, labelKey: "nav.team", href: "/app/team", color: "#84cc16" },
  { icon: Palette, labelKey: "nav.branding", href: "/app/settings/branding", color: "#a855f7" },
  { icon: Rocket, labelKey: "nav.onboarding", href: "/app/onboarding", color: "#0ea5e9" },
];

export default function AppDashboardPage() {
  const { locale, setLocale, t } = useTranslation();
  const [status, setStatus] = useState<AppStatus>("loading");
  const [session, setSession] = useState<TenantSession | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<{
    salesToday: number;
    activeOrders: number;
    occupiedTables: string;
    cashBalance: number;
    shiftOpen: boolean;
    cashOpen: boolean;
  } | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [currentShift, setCurrentShift] = useState<CurrentShiftResponse | null>(null);
  const [cashSummary, setCashSummary] = useState<CashSessionSummary | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [qrPendingOrders, setQrPendingOrders] = useState<QrPendingOrder[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [branding, setBranding] = useState<TenantBranding>({
    displayName: "GiroMesa",
    logoUrl: null,
    themeMode: "light",
    accentPreset: "amber",
  });
  const [salesPeriodData, setSalesPeriodData] = useState<SalesByPeriodResponse | null>(null);
  const [actionStatus, setActionStatus] = useState(t("dashboard.loadingDashboard"));
  const [widgetPrefs, setWidgetPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined")
      return { summaryCards: true, shiftPriorities: true, readiness: true };
    try {
      const saved = localStorage.getItem("gm_dashboard_widgets");
      return saved
        ? JSON.parse(saved)
        : { summaryCards: true, shiftPriorities: true, readiness: true };
    } catch {
      return { summaryCards: true, shiftPriorities: true, readiness: true };
    }
  });
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);

  const visibleNav = useMemo(
    () => filterNavigationByPermissions(session?.permissions ?? []),
    [session],
  );
  const operatorProfile = useMemo(() => readOperatorProfile(session?.permissions ?? []), [session]);
  const activeBranding = branding;
  const permissions = session?.permissions ?? [];
  const canManageTenant = permissions.includes("tenant:manage");
  const canOperatePos = permissions.includes("pos:operate");
  const canOperateKds = permissions.includes("kds:operate");
  const canManageCash = permissions.includes("cash:manage");
  const canReadReports = permissions.includes("reports:read");
  const canManageInventory = permissions.includes("inventory:manage");
  const accessibleQuickLinks = useMemo(() => {
    const accessibleHrefs = new Set(visibleNav.map((item) => item.href));
    return quickLinks.filter((link) => accessibleHrefs.has(link.href));
  }, [visibleNav]);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      try {
        const context = await getSession();
        if (ignore) return;
        setSession(context);
        const can = (permission: string) => context.permissions.includes(permission);

        if (
          context.billing?.status === "payment_required" ||
          context.billing?.status === "access_blocked"
        ) {
          setStatus("ready");
          setActionStatus(t("trial.trialExpired"));
          return;
        }

        const [
          tenantBranding,
          summary,
          onboarding,
          shift,
          cash,
          alerts,
          qrOrders,
          kdsTickets,
          tableRows,
        ] = await Promise.all([
          getTenantBranding(),
          context.branchId && can("pos:operate")
            ? getDashboardSummary(context.branchId).catch(() => null)
            : Promise.resolve(null),
          context.branchId && can("tenant:manage")
            ? getOnboardingStatus(context.branchId).catch(() => null)
            : Promise.resolve(null),
          context.branchId && (can("pos:operate") || can("cash:manage"))
            ? getCurrentShift(context.branchId).catch(() => null)
            : Promise.resolve(null),
          context.branchId && can("cash:manage")
            ? getCashSessionSummary(context.branchId).catch(() => null)
            : Promise.resolve(null),
          context.branchId && can("inventory:manage")
            ? listInventoryAlerts(context.branchId).catch(() => [])
            : Promise.resolve([]),
          context.branchId && can("pos:qr_review")
            ? listQrPendingOrders(context.branchId).catch(() => [])
            : Promise.resolve([]),
          can("kds:operate") ? listKdsTickets().catch(() => []) : Promise.resolve([]),
          context.branchId && can("pos:operate")
            ? listTables(context.branchId).catch(() => [])
            : Promise.resolve([]),
        ]);

        setBranding(tenantBranding);
        setDashboardSummary(summary);
        setOnboardingStatus(onboarding);
        setCurrentShift(shift);
        setCashSummary(cash);
        setInventoryAlerts(alerts);
        setQrPendingOrders(qrOrders);
        setTickets(kdsTickets);
        setTables(tableRows);

        if (context.branchId && can("reports:read")) {
          const endDate = new Date().toISOString();
          const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const salesData = await getSalesByPeriod({
            branchId: context.branchId,
            startDate,
            endDate,
            groupBy: "day",
          }).catch(() => null);
          setSalesPeriodData(salesData);
        }

        if (!ignore) {
          setStatus("ready");
          setActionStatus(t("dashboard.activeSession"));
        }
      } catch (error) {
        if (ignore) return;
        const maybeApiError = error as ApiError;
        setStatus(maybeApiError.status === 401 ? "unauthenticated" : "offline");
        setActionStatus(
          maybeApiError.status === 401
            ? t("dashboard.loginRequired")
            : t("dashboard.operationUnavailable"),
        );
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [t]);

  useEffect(() => {
    try {
      localStorage.setItem("gm_dashboard_widgets", JSON.stringify(widgetPrefs));
    } catch {
      /* ignore */
    }
  }, [widgetPrefs]);

  const occupiedCount = tables.filter((table) => table.status !== "free").length;
  const activeOrderCount =
    dashboardSummary?.activeOrders ??
    tickets.filter((t) => !["ready", "served"].includes(t.status)).length + qrPendingOrders.length;
  const occupiedLabel =
    dashboardSummary?.occupiedTables ?? `${occupiedCount}/${Math.max(tables.length, 1)}`;

  const metrics = useMemo(() => {
    const rows: DashboardMetric[] = [];
    if (canReadReports) {
      rows.push([
        t("dashboard.salesToday"),
        dashboardSummary ? formatMoney(dashboardSummary.salesToday) : "R$ 0,00",
        dashboardSummary?.shiftOpen
          ? t("dashboard.openShift")
          : (dashboardSummary?.salesToday ?? 0) > 0
            ? t("dashboard.confirmedRevenue")
            : t("dashboard.noSalesToday"),
      ] as const);
    }
    if (canOperatePos || canOperateKds) {
      rows.push([
        canOperateKds && !canOperatePos ? "Tickets em produção" : t("dashboard.activeOrders"),
        String(Math.max(activeOrderCount, 0)),
        canOperateKds && !canOperatePos ? "KDS" : "QR + operação",
      ]);
    }
    if (canOperatePos) {
      rows.push([t("dashboard.occupiedTables"), occupiedLabel, t("dashboard.salonNow")]);
    }
    if (canManageCash) {
      rows.push([
        t("dashboard.currentCash"),
        dashboardSummary ? formatMoney(dashboardSummary.cashBalance) : "R$ 0,00",
        dashboardSummary?.cashOpen ? t("dashboard.openCash") : t("dashboard.closed"),
      ]);
    }
    return rows;
  }, [
    activeOrderCount,
    canManageCash,
    canOperateKds,
    canOperatePos,
    canReadReports,
    dashboardSummary,
    occupiedLabel,
    t,
  ]);

  const billingBlocked =
    session?.billing?.status === "payment_required" ||
    session?.billing?.status === "access_blocked";
  const trialDaysLeft = session?.billing?.trialDaysRemaining;
  const dashboardTitle = canManageTenant
    ? "Visão do negócio"
    : canManageCash
      ? "Visão do turno"
      : canOperatePos
        ? "Prioridades do atendimento"
        : "Visão operacional";
  const dashboardDescription = canManageTenant
    ? "Saúde financeira, operação e próximos riscos da sua unidade em uma única visão."
    : canManageCash
      ? "Abertura, conferência e prioridades do turno sem perder o controle do caixa."
      : canOperatePos
        ? "Mesas, pedidos e produção em andamento para atender com velocidade."
        : "Acompanhe as tarefas liberadas para o seu perfil.";

  async function handleLogout() {
    await logout().catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <AppShell
      branding={activeBranding}
      status={status}
      statusTitle={readStatusTitle(status)}
      statusMessage={actionStatus}
      currentPath="/app"
      navigationItems={visibleNav}
      isPosWorkspace={false}
      canOpenPos={canOperatePos}
      operatorLabel={operatorProfile.title}
      branchLabel={session?.branchName ?? "Filial ativa"}
      workspaceTitle={dashboardTitle}
      workspaceDescription={dashboardDescription}
      onLogout={status === "ready" ? () => void handleLogout() : undefined}
      locale={locale}
      onLocaleChange={setLocale}
    >
      <ProfileActionStrip profile={operatorProfile} />

      {billingBlocked ? (
        <section className="billing-gate panel">
          <div>
            <span className="section-kicker">{t("dashboard.subscriptionRequired")}</span>
            <h1>{t("dashboard.activateSubscription")}</h1>
            <p>{t("dashboard.trialEnded")}</p>
          </div>
          <div className="billing-gate-actions">
            <a className="button primary" href="/app/billing">
              {t("dashboard.viewSubscription")}
            </a>
            <a className="button secondary" href="mailto:comercial@giromesa.com.br">
              {t("dashboard.contactSales")}
            </a>
            <a className="button secondary" href="/login">
              {t("dashboard.switchAccount")}
            </a>
          </div>
        </section>
      ) : null}

      {!billingBlocked && metrics.length > 0 ? <OperationalSummaryCards metrics={metrics} /> : null}

      {!billingBlocked ? (
        <div className="trial-status-strip">
          <span>
            {typeof trialDaysLeft === "number" && session?.billing?.tenantStatus === "trial"
              ? t("dashboard.trialDaysRemaining").replace("{{days}}", String(trialDaysLeft))
              : t("dashboard.subscriptionActive")}
          </span>
          {canManageTenant ? (
            <a href="/app/settings/branding">{t("dashboard.prepareEnvironment")}</a>
          ) : null}
        </div>
      ) : null}

      {!billingBlocked ? (
        <div className="dashboard-customize-row">
          <button
            className="button secondary compact"
            type="button"
            onClick={() => setShowWidgetPicker(!showWidgetPicker)}
          >
            <Settings size={14} /> {t("dashboard.customize")}
          </button>
          {showWidgetPicker ? (
            <div className="widget-picker">
              {(["summaryCards", "shiftPriorities", "readiness"] as const).map((key) => (
                <label key={key} className="widget-toggle">
                  <input
                    type="checkbox"
                    checked={widgetPrefs[key]}
                    onChange={(e) =>
                      setWidgetPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                  <span>
                    {key === "summaryCards"
                      ? t("dashboard.summaryCards")
                      : key === "shiftPriorities"
                        ? t("dashboard.priorities")
                        : t("dashboard.readiness")}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {widgetPrefs.shiftPriorities && !billingBlocked ? (
        <>
          <PendingCenter
            onboardingStatus={onboardingStatus}
            currentShift={currentShift}
            cashSummary={cashSummary}
            inventoryAlerts={inventoryAlerts}
            qrPendingOrders={qrPendingOrders}
            tickets={tickets}
            canManageTenant={canManageTenant}
            canManageCash={canManageCash}
            canManageInventory={canManageInventory}
            canOperatePos={canOperatePos}
            canOperateKds={canOperateKds}
          />
          <hr className="dashboard-divider" />
        </>
      ) : null}

      {widgetPrefs.readiness &&
      !billingBlocked &&
      (canManageTenant || canManageCash || canOperatePos) ? (
        <OperationalReadinessPanel
          onboardingStatus={onboardingStatus}
          currentShift={currentShift}
          cashSummary={cashSummary}
          onOpenPos={() => {
            window.location.href = "/app/pos";
          }}
          canManageOnboarding={canManageTenant}
          canManageCash={canManageCash}
          canOpenPos={canOperatePos}
        />
      ) : null}

      {!billingBlocked ? <PeriodSalesCard salesData={salesPeriodData} /> : null}

      {!billingBlocked ? (
        <RecentAlertsSection inventoryAlerts={inventoryAlerts} cashSummary={cashSummary} />
      ) : null}

      {!billingBlocked ? (
        <section className="quick-links-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{t("dashboard.quickAccess")}</span>
              <h2>{t("dashboard.systemModules")}</h2>
            </div>
          </div>
          <div className="quick-links-grid">
            {accessibleQuickLinks.map((link) => (
              <a className="quick-link-card" href={link.href} key={link.href}>
                <link.icon size={24} style={{ color: link.color }} />
                <strong>{t(link.labelKey)}</strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
