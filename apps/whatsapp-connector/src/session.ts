export type ConnectorConnection = "connecting" | "open" | "closed" | "logged_out";

export function connectionFromUpdate(update: {
  connection?: string;
  lastDisconnect?: unknown;
}): ConnectorConnection {
  if (update.connection === "open") return "open";
  if (update.connection === "close") return "closed";
  return "connecting";
}

export function isLoggedOut(error: unknown): boolean {
  const status = (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
  return status === 401;
}

export function normalizeQr(qr: string | undefined): string | undefined {
  return qr && qr.length <= 4096 ? qr : undefined;
}
