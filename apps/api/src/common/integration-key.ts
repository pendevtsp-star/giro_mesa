import { randomBytes } from "node:crypto";
import { hashOpaqueToken } from "./http";

const prefixes: Record<string, string> = {
  club_whisky: "gm_club",
  local_printer_connector: "gm_print",
};

export function createIntegrationApiKey(provider: string) {
  const prefix = prefixes[provider] ?? "gm_int";
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;

  return {
    token,
    tokenHash: hashOpaqueToken(token),
    lastFour: token.slice(-4),
  };
}

export function hashIntegrationApiKey(token: string) {
  return hashOpaqueToken(token);
}
