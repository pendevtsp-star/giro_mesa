export type AppStatus = "loading" | "ready" | "unauthenticated" | "offline";
export type RealtimeStatus = "offline" | "connecting" | "live";
export type HistoryFilter = "all" | "qr" | "kds" | "payments" | "ops";

export type DashboardMetric = readonly [label: string, value: string, hint: string];

export type OperatorProfile = {
  kicker: string;
  title: string;
  description: string;
  actions: Array<{ label: string; href: string }>;
};
