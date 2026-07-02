import { createHash, randomBytes, randomUUID } from "node:crypto";

export type HeaderValue = string | string[] | undefined;
export type HeaderRecord = Record<string, HeaderValue>;

export function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requestIdFromHeaders(headers: HeaderRecord) {
  return firstHeader(headers["x-request-id"]) ?? randomUUID();
}

export function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (!name) {
      continue;
    }
    cookies.set(name, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export function createSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashOpaqueToken(token),
  };
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `gm_session=${encodeURIComponent(
    token,
  )}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}
