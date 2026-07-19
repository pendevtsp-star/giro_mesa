import { BadgeDollarSign, Bell } from "lucide-react";
import type { ReactNode } from "react";
import type { AppStatus } from "../../features/dashboard/dashboard-types";
import type { TenantBranding } from "../../lib/giromesa-api";
import { UnauthenticatedState } from "../states/AppStates";
import { AppNavigation } from "./AppNavigation";
import type { AppNavigationItem } from "./navigation";

export function AppShell({
  branding,
  status,
  statusTitle,
  statusMessage,
  currentPath,
  navigationItems,
  isPosWorkspace,
  children,
}: {
  branding: TenantBranding;
  status: AppStatus;
  statusTitle: string;
  statusMessage: string;
  currentPath: string;
  navigationItems: readonly AppNavigationItem[];
  isPosWorkspace: boolean;
  children: ReactNode;
}) {
  const brandingInitial = branding.displayName.slice(0, 1).toUpperCase() || "G";

  return (
    <main
      className="app-layout"
      data-testid="workspace-dashboard"
      data-theme={branding.themeMode}
      data-accent={branding.accentPreset}
      data-view={isPosWorkspace ? "pos" : "dashboard"}
    >
      <AppNavigation branding={branding} items={navigationItems} currentPath={currentPath} />

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <span className="tenant-avatar">
              {branding.logoUrl ? (
                <span
                  className="tenant-logo cover"
                  style={{ backgroundImage: `url(${branding.logoUrl})` }}
                  aria-hidden="true"
                />
              ) : (
                brandingInitial
              )}
            </span>
            <div>
              <span className="section-kicker">Unidade Centro</span>
              <h1>{isPosWorkspace ? "PDV do turno" : "Visão do turno"}</h1>
              <p>
                {isPosWorkspace
                  ? "Atendimento rápido, pedido, produção e recebimento em uma única superfície."
                  : `${branding.displayName} · gestão em tempo real, sem misturar a operação de caixa.`}
              </p>
            </div>
          </div>
          <div className="toolbar">
            <a className="button secondary" href="/login">
              <Bell size={18} /> {status === "ready" ? "Sessão ativa" : "Entrar"}
            </a>
            <a className="button primary" href="/app?view=pos" data-testid="open-pos">
              <BadgeDollarSign size={18} /> Abrir PDV
            </a>
          </div>
        </header>

        <section className={`live-banner live-banner-${status}`}>
          <strong>{statusTitle}</strong>
          <span>{statusMessage}</span>
        </section>

        {status !== "ready" ? (
          <UnauthenticatedState
            actions={
              <>
                <a className="button primary" href="/login">
                  Entrar no painel
                </a>
                <a className="button secondary" href="/m/bar-aurora-demo">
                  Ver cardápio QR
                </a>
                <a className="button ghost" href="/status">
                  Ver status
                </a>
              </>
            }
          />
        ) : null}

        {children}
      </section>
    </main>
  );
}
