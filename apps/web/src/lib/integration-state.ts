export type IntegrationState =
  | "not_configured"
  | "homologation"
  | "active"
  | "degraded"
  | "revoked";

export function integrationStateDetails(state: string | null | undefined) {
  const normalized: IntegrationState =
    state === "active" || state === "homologation" || state === "degraded" || state === "revoked"
      ? state
      : "not_configured";
  return {
    state: normalized,
    label: {
      not_configured: "Não configurada",
      homologation: "Em homologação",
      active: "Ativa",
      degraded: "Degradada",
      revoked: "Revogada",
    }[normalized],
    contingency:
      normalized === "active"
        ? "Monitore a última sincronização e mantenha o procedimento manual disponível."
        : "Use o procedimento manual; o conector não deve ser tratado como funcional.",
  };
}

export function availableIntegrationLifecycleActions(state: IntegrationState) {
  if (state === "homologation") return ["activate", "revoke"] as const;
  if (state === "active" || state === "degraded") return ["health", "revoke"] as const;
  return [] as const;
}
