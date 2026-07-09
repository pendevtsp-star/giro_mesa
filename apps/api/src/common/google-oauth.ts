import { createPublicKey, verify as verifySignature } from "node:crypto";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

type GoogleJwk = {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  x5c?: string[];
};

type GoogleJwks = {
  keys: GoogleJwk[];
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export type GoogleIdTokenClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp: number;
  iat?: number;
};

let cachedJwks: { expiresAt: number; keys: GoogleJwk[] } | null = null;

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account",
    state: input.state,
  });

  return `${GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${body.slice(0, 240)}`);
  }

  return (await response.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
    expires_in: number;
  };
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google userinfo failed: ${response.status} ${body.slice(0, 240)}`);
  }

  return (await response.json()) as GoogleUserInfo;
}

export async function verifyGoogleIdToken(input: { idToken: string; clientId: string }) {
  const parts = input.idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Google id_token format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid Google id_token payload");
  }
  const header = decodeJwtSegment<{ alg?: string; kid?: string; typ?: string }>(encodedHeader);
  const claims = decodeJwtSegment<GoogleIdTokenClaims>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported Google id_token header");
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(input.clientId)) {
    throw new Error("Google id_token audience mismatch");
  }
  if (!GOOGLE_ISSUERS.has(claims.iss)) {
    throw new Error("Google id_token issuer mismatch");
  }
  if (!claims.sub || claims.exp * 1000 <= Date.now()) {
    throw new Error("Google id_token expired or invalid");
  }

  const kid = header.kid;
  const jwk = await resolveGoogleJwk(kid);
  if (!jwk?.x5c?.[0]) {
    throw new Error("Google signing key not found");
  }

  const publicKey = createPublicKey({
    key: certificateToPem(jwk.x5c[0]),
    format: "pem",
  });
  const verified = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, "base64url"),
  );

  if (!verified) {
    throw new Error("Invalid Google id_token signature");
  }

  return claims;
}

function decodeJwtSegment<T>(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

async function resolveGoogleJwk(kid: string) {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys.find((key) => key.kid === kid);
  }

  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google JWKS fetch failed: ${response.status} ${body.slice(0, 240)}`);
  }

  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const payload = (await response.json()) as GoogleJwks;
  cachedJwks = {
    expiresAt: now + maxAgeSeconds * 1000,
    keys: payload.keys ?? [],
  };

  return cachedJwks.keys.find((key) => key.kid === kid);
}

function certificateToPem(certificate: string) {
  const body = certificate.match(/.{1,64}/g)?.join("\n") ?? certificate;
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}
