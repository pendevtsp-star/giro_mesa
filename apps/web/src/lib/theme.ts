export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "gm_theme";

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean) {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
