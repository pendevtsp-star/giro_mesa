"use client";

import { CircleAlert, Menu, Wifi, WifiOff, X } from "lucide-react";
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
  const { branding } = useSession();
  const activeBranding = branding ?? fallbackBranding;

  useEffect(() => {
    document.documentElement.dataset.accent = activeBranding.accentPreset;
  }, [activeBranding.accentPreset]);

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
          <ThemeToggle defaultPreference={activeBranding.themeMode} />
        </fieldset>
      </header>
      <div className="gm-operational-content">{children}</div>
    </div>
  );
}

function AdministrativeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useConnectivity();
  const { locale, setLocale } = useTranslation();
  const { session, branding } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeBranding = branding ?? fallbackBranding;
  const navigation = useMemo(
    () => filterNavigationByPermissions(session?.permissions ?? []),
    [session?.permissions],
  );

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
            <span className={`gm-connection ${online ? "online" : "degraded"}`} role="status">
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {online ? "Online" : "Offline"}
            </span>
            <ThemeToggle defaultPreference={activeBranding.themeMode} />
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
    </div>
  );
}
