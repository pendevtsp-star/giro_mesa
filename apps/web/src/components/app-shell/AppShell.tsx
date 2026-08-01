"use client";

import { BadgeDollarSign, CircleCheck, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { AppStatus } from "../../features/dashboard/dashboard-types";
import type { TenantBranding } from "../../lib/giromesa-api";
import { type Locale, useTranslation } from "../../lib/i18n";
import { UnauthenticatedState } from "../states/AppStates";
import { AppNavigation } from "./AppNavigation";
import type { AppNavigationItem } from "./navigation";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({
  branding,
  status,
  statusTitle,
  statusMessage,
  currentPath,
  navigationItems,
  isPosWorkspace,
  canOpenPos,
  operatorLabel,
  onLogout,
  locale,
  onLocaleChange,
  children,
}: {
  branding: TenantBranding;
  status: AppStatus;
  statusTitle: string;
  statusMessage: string;
  currentPath: string;
  navigationItems: readonly AppNavigationItem[];
  isPosWorkspace: boolean;
  canOpenPos: boolean;
  operatorLabel: string;
  onLogout?: (() => void) | undefined;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <main
      className="app-layout app-layout-night"
      data-testid="workspace-dashboard"
      data-accent={branding.accentPreset}
      data-view={isPosWorkspace ? "pos" : "dashboard"}
    >
      <AppNavigation
        branding={branding}
        items={navigationItems}
        currentPath={currentPath}
        locale={locale}
        onLocaleChange={onLocaleChange}
      />

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
                <span className="tenant-logo brand-symbol" aria-hidden="true" />
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
            <div className="user-avatar-container">
              <div className="user-avatar-circle">
                {branding.logoUrl ? (
                  // biome-ignore lint/performance/noImgElement: tenant logos use dynamic external URLs.
                  <img
                    src={branding.logoUrl}
                    alt={branding.displayName}
                    className="user-avatar-logo"
                  />
                ) : (
                  <span className="user-avatar-logo brand-symbol" aria-hidden="true" />
                )}
              </div>
              <div className="user-avatar-info">
                <span className="user-avatar-name">{branding.displayName}</span>
                <span className="user-avatar-role">{operatorLabel}</span>
              </div>
            </div>
            {status === "ready" ? (
              <span className="session-status" role="status" aria-label="Sessão conectada">
                <CircleCheck size={17} /> Conectado
              </span>
            ) : (
              <a className="button secondary" href="/login">
                Entrar
              </a>
            )}
            <ThemeToggle defaultPreference={branding.themeMode} />
            {status === "ready" && onLogout && (
              <button className="button secondary" type="button" onClick={onLogout}>
                <LogOut size={18} /> Sair
              </button>
            )}
            {status === "ready" && canOpenPos ? (
              <a className="button primary" href="/app/pos" data-testid="open-pos">
                <BadgeDollarSign size={18} /> Abrir PDV
              </a>
            ) : null}
          </div>
        </header>

        {status !== "ready" ? (
          <section className={`live-banner live-banner-${status}`}>
            <strong>{statusTitle}</strong>
            <span>{statusMessage}</span>
          </section>
        ) : null}

        {status !== "ready" ? (
          <UnauthenticatedState
            actions={
              <>
                <a className="button primary" href="/login">
                  {t("auth.signIn")}
                </a>
                <a className="button secondary" href="/m/bar-aurora-demo">
                  {t("buttons.exploreQR")}
                </a>
                <a className="button ghost" href="/status">
                  {t("common.loading")}
                </a>
              </>
            }
          />
        ) : null}

        {status === "ready" ? children : null}
      </section>
    </main>
  );
}
