export type PosShortcutAction =
  | "search"
  | "toggle-mode"
  | "focus-table"
  | "receive"
  | "production"
  | "bill"
  | "close"
  | "dismiss";

const POS_SHORTCUTS: Readonly<Record<string, PosShortcutAction>> = {
  F2: "search",
  F3: "toggle-mode",
  F4: "receive",
  F6: "focus-table",
  F8: "production",
  F9: "bill",
  F10: "close",
  Escape: "dismiss",
};

export function resolvePosShortcut(key: string): PosShortcutAction | null {
  return POS_SHORTCUTS[key] ?? null;
}
