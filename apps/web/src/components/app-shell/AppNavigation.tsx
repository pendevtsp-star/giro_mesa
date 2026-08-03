"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { TenantBranding } from "../../lib/giromesa-api";
import { type Locale, useTranslation } from "../../lib/i18n";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { BrandLink } from "./BrandMark";
import { type AppNavigationItem, groupNavigationItems, isNavigationItemActive } from "./navigation";

export function AppNavigation({
  branding,
  items,
  currentPath,
  locale,
  onLocaleChange,
}: {
  branding: TenantBranding;
  items: readonly AppNavigationItem[];
  currentPath: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const { t } = useTranslation();
  const groups = groupNavigationItems(items);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside className="sidebar">
      <BrandLink />
      <LanguageSwitcher currentLocale={locale} onLocaleChange={onLocaleChange} />
      <button
        aria-controls="app-primary-navigation"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Fechar menu de módulos" : "Abrir menu de módulos"}
        className="sidebar-menu-toggle"
        onClick={() => setMobileOpen((open) => !open)}
        type="button"
      >
        {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        <span>Menu</span>
      </button>
      <div className="tenant-chip">
        {branding.logoUrl ? (
          <span
            className="tenant-logo"
            style={{ backgroundImage: `url(${branding.logoUrl})` }}
            aria-hidden="true"
          />
        ) : (
          <span className="tenant-mini-mark" aria-hidden="true">
            {branding.displayName.slice(0, 1).toUpperCase() || "G"}
          </span>
        )}
        <span>{branding.displayName}</span>
      </div>
      <nav
        aria-label={t("nav.modules")}
        className={mobileOpen ? "is-open" : ""}
        id="app-primary-navigation"
      >
        {groups.map((group) => (
          <div className="nav-group" key={group.group}>
            <span className="nav-group-label">{t(`nav.${group.group}`)}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  className={isNavigationItemActive(item, currentPath) ? "active" : ""}
                  href={item.href}
                  key={item.labelKey}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
