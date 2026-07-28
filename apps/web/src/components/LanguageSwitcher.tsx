"use client";

import { Globe } from "lucide-react";
import { type Locale, locales } from "../lib/i18n";

export function LanguageSwitcher({
  currentLocale,
  onLocaleChange,
}: {
  currentLocale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <div className="language-switcher">
      <Globe size={16} />
      <select
        value={currentLocale}
        onChange={(e) => onLocaleChange(e.target.value as Locale)}
        aria-label="Select language"
      >
        {locales.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.label}
          </option>
        ))}
      </select>
    </div>
  );
}
