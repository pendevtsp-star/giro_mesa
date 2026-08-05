export function normalizeCspReport(input: unknown) {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const report =
    body["csp-report"] && typeof body["csp-report"] === "object"
      ? (body["csp-report"] as Record<string, unknown>)
      : body;
  return {
    directive:
      typeof report["effective-directive"] === "string"
        ? report["effective-directive"].slice(0, 80)
        : "unknown",
    blockedOrigin: safeOrigin(report["blocked-uri"]),
    documentOrigin: safeOrigin(report["document-uri"]),
  };
}

function safeOrigin(value: unknown) {
  if (typeof value !== "string") return "unknown";
  if (value === "inline" || value === "eval") return value;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}
