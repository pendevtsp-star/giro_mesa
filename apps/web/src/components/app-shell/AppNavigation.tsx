"use client";

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

  return (
    <aside className="sidebar">
      <BrandLink />
      <LanguageSwitcher currentLocale={locale} onLocaleChange={onLocaleChange} />
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
      <nav aria-label={t("nav.modules")}>
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
