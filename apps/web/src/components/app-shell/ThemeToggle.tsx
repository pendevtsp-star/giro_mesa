"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../../lib/theme";

const options = [
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema escuro", icon: Moon },
  { value: "system", label: "Usar tema do dispositivo", icon: Monitor },
] as const;

function applyTheme(preference: ThemePreference) {
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(preference, systemPrefersDark);
  document.documentElement.dataset.themePreference = preference;
}

export function ThemeToggle({
  defaultPreference = "system",
}: {
  defaultPreference?: ThemePreference;
}) {
  const [preference, setPreference] = useState<ThemePreference>(defaultPreference);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const initial = isThemePreference(stored) ? stored : defaultPreference;
    setPreference(initial);
  }, [defaultPreference]);

  useEffect(() => {
    applyTheme(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => preference === "system" && applyTheme("system");
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, [preference]);

  function select(next: ThemePreference) {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setPreference(next);
  }

  return (
    <div className="gm-theme-toggle">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          aria-label={label}
          aria-pressed={preference === value}
          key={value}
          onClick={() => select(value)}
          title={label}
          type="button"
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
