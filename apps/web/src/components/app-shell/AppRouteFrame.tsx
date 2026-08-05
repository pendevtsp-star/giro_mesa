"use client";

import { Dialog, Drawer } from "@giromesa/ui";
import {
  Building2,
  CircleAlert,
  Menu,
  Search,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { readOperatorProfile } from "../../lib/formatters/app-dashboard";
import { formatMoney, type TenantBranding } from "../../lib/giromesa-api";
import { useCashSummary } from "../../lib/hooks/useCashSummary";
import { useOperationalShift } from "../../lib/hooks/useOperationalShift";
import { useTranslation } from "../../lib/i18n";
import { useSession } from "../../lib/session-context";
import { AppNavigation } from "./AppNavigation";
import { BrandLink } from "./BrandMark";
import { DensityToggle } from "./DensityToggle";
import { filterNavigationByPermissions } from "./navigation";
import { ThemeToggle } from "./ThemeToggle";

const fallbackBranding: TenantBranding = {
  displayName: "GiroMesa",
  logoUrl: null,
  themeMode: "system",
  accentPreset: "amber",
};

const operationalTitles: Record<string, string> = {
  "/app/pos": "PDV",
  "/app/salon": "Salão",
  "/app/waiter": "Garçom",
  "/app/kds": "KDS",
};

function useConnectivity() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

export function AppRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { branding, operationalDevice } = useSession();
  const activeBranding = branding ?? fallbackBranding;

  useEffect(() => {
    document.documentElement.dataset.accent = activeBranding.accentPreset;
  }, [activeBranding.accentPreset]);

  useEffect(() => {
    if (!operationalDevice || operationalDevice.allowModeSwitch) return;
    const operationalPath = Object.keys(operationalTitles).find(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (!operationalPath) return;
    const expectedPath = ["kds", "expedition"].includes(operationalDevice.initialMode)
      ? "/app/kds"
      : operationalDevice.initialMode === "table"
        ? "/app/waiter"
        : "/app/pos";
    if (operationalPath === expectedPath) return;
    const query = new URLSearchParams();
    if (expectedPath === "/app/pos") query.set("mode", "counter");
    if (expectedPath === "/app/kds" && operationalDevice.stationId)
      query.set("stationId", operationalDevice.stationId);
    window.location.replace(`${expectedPath}${query.size ? `?${query}` : ""}`);
  }, [operationalDevice, pathname]);

  if (pathname === "/app") return children;

  const operational = Object.keys(operationalTitles).find(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  return operational ? (
    <OperationalShell title={operationalTitles[operational] ?? "Operação"}>
      {children}
    </OperationalShell>
  ) : (
    <AdministrativeShell>{children}</AdministrativeShell>
  );
}

function BranchSwitcher() {
  const { session, switchBranch } = useSession();
  const branches = session?.branches ?? [];
  if (!session?.branchId || branches.length === 0) return null;

  return (
    <label className="gm-branch-switcher">
      <Building2 size={15} aria-hidden="true" />
      <span className="sr-only">Filial ativa</span>
      <select
        aria-label="Filial ativa"
        value={session.branchId}
        onChange={(event) => switchBranch(event.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ShellPreferences({
  themeMode,
  includeBranch,
}: {
  themeMode: TenantBranding["themeMode"];
  includeBranch: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`gm-shell-preferences ${open ? "open" : ""}`}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Fechar preferências" : "Abrir preferências"}
        className="gm-shell-preferences-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={18} />
      </button>
      <div className="gm-shell-preferences-panel">
        {includeBranch ? <BranchSwitcher /> : null}
        <DensityToggle />
        <ThemeToggle defaultPreference={themeMode} />
      </div>
      <Drawer onClose={() => setOpen(false)} open={open} title="Preferências">
        <div className="gm-shell-preferences-drawer">
          {includeBranch ? <BranchSwitcher /> : null}
          <DensityToggle />
          <ThemeToggle defaultPreference={themeMode} />
        </div>
      </Drawer>
    </div>
  );
}

function OperationalShell({ children, title }: { children: ReactNode; title: string }) {
  const online = useConnectivity();
  const { session, branding } = useSession();
  const activeBranding = branding ?? fallbackBranding;
  const profile = readOperatorProfile(session?.permissions ?? []);
  const shift = useOperationalShift(session?.branchId);
  const cash = useCashSummary(session?.branchId);
  const degraded = Boolean(shift.error || cash.error);

  return (
    <div className="gm-operational-shell">
      <header className="gm-operational-header">
        <BrandLink />
        <div className="gm-module-title">
          <strong>{title}</strong>
          <span>{activeBranding.displayName}</span>
        </div>
        <fieldset className="gm-operational-context" aria-label="Contexto operacional">
          <span>
            Turno <strong>{shift.data?.shift?.status === "open" ? "aberto" : "fechado"}</strong>
          </span>
          <span>
            Caixa{" "}
            <strong>
              {cash.data?.session ? formatMoney(cash.data.session.expectedAmountCents) : "fechado"}
            </strong>
          </span>
          <span
            className={`gm-connection ${online && !degraded ? "online" : "degraded"}`}
            role="status"
            aria-label={online && !degraded ? "Online" : online ? "Status degradado" : "Offline"}
          >
            {online && !degraded ? (
              <Wifi size={15} />
            ) : online ? (
              <CircleAlert size={15} />
            ) : (
              <WifiOff size={15} />
            )}
            {online && !degraded ? "Online" : online ? "Atenção" : "Offline"}
          </span>
          <span className="gm-operator-label">{profile.title}</span>
          <BranchSwitcher />
          <ShellPreferences includeBranch={false} themeMode={activeBranding.themeMode} />
        </fieldset>
      </header>
      <div className="gm-operational-content">{children}</div>
    </div>
  );
}

function AdministrativeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useConnectivity();
  const { locale, setLocale, t } = useTranslation();
  const { session, branding } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const activeBranding = branding ?? fallbackBranding;
  const navigation = useMemo(
    () => filterNavigationByPermissions(session?.permissions ?? []),
    [session?.permissions],
  );
  const quickItems = useMemo(
    () =>
      navigation
        .map((item) => ({ ...item, label: t(item.labelKey) }))
        .filter((item) => {
          const query = quickQuery.trim().toLocaleLowerCase();
          return !query || `${item.label} ${item.href}`.toLocaleLowerCase().includes(query);
        }),
    [navigation, quickQuery, t],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`gm-admin-shell ${menuOpen ? "menu-open" : ""}`}>
      <div className="gm-admin-navigation">
        <AppNavigation
          branding={activeBranding}
          currentPath={pathname}
          items={navigation}
          locale={locale}
          onLocaleChange={setLocale}
        />
      </div>
      <section className="gm-admin-workspace">
        <header className="gm-admin-header">
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="gm-admin-menu"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <strong>{activeBranding.displayName}</strong>
            <span>Administração</span>
          </div>
          <div className="gm-admin-actions">
            <button
              className="gm-command-trigger"
              type="button"
              aria-label="Busca global"
              onClick={() => setQuickOpen(true)}
            >
              <Search size={16} />
              <span>{t("common.search")}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className={`gm-connection ${online ? "online" : "degraded"}`} role="status">
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {online ? "Online" : "Offline"}
            </span>
            <ShellPreferences includeBranch themeMode={activeBranding.themeMode} />
          </div>
        </header>
        <div className="gm-admin-content">{children}</div>
      </section>
      {menuOpen ? (
        <button
          aria-label="Fechar menu"
          className="gm-admin-backdrop"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}
      <Dialog
        className="gm-command-palette"
        onClose={() => setQuickOpen(false)}
        open={quickOpen}
        title="Busca global"
      >
        <div className="gm-command-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={quickQuery}
            onChange={(event) => setQuickQuery(event.target.value)}
            placeholder="Buscar módulo ou ação"
            aria-label="Buscar módulo ou ação"
            data-dialog-initial-focus
          />
          <kbd>Esc</kbd>
        </div>
        <div className="gm-command-results">
          {quickItems.length ? (
            quickItems.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setQuickOpen(false)}>
                <item.icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
                <small>{item.href}</small>
              </a>
            ))
          ) : (
            <p className="muted-copy" role="status">
              {t("common.noResults")}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
