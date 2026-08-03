export type QrFontPreset = "system" | "serif" | "display";

export function normalizeQrFontPreset(value: unknown): QrFontPreset {
  return value === "serif" || value === "display" ? value : "system";
}
