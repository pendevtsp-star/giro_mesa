import { createHmac, timingSafeEqual } from "node:crypto";

export type FederationClaims = {
  iss: string;
  aud: "doseclub";
  sub: string;
  tenant_id: string;
  source_product: "giromesa";
  target_product: "doseclub";
  jti: string;
  iat: number;
  exp: number;
  branch_id?: string;
  return_to?: string;
};

const header = { alg: "HS256", typ: "JWT" } as const;

export function signFederationToken(claims: FederationClaims, secret: string) {
  const encodedHeader = encodeJson(header);
  const encodedClaims = encodeJson(claims);
  const body = `${encodedHeader}.${encodedClaims}`;
  return `${body}.${signature(body, secret)}`;
}

export function verifyFederationToken(
  token: string,
  input: { secret: string; issuer: string; audience: FederationClaims["aud"]; now?: number },
) {
  const [encodedHeader, encodedClaims, suppliedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedClaims || !suppliedSignature || extra) {
    throw new Error("Invalid federation token");
  }

  const body = `${encodedHeader}.${encodedClaims}`;
  const expected = Buffer.from(signature(body, input.secret), "base64url");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid federation token signature");
  }

  const parsedHeader = decodeJson<Record<string, unknown>>(encodedHeader);
  const claims = decodeJson<FederationClaims>(encodedClaims);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (
    parsedHeader.alg !== header.alg ||
    parsedHeader.typ !== header.typ ||
    claims.iss !== input.issuer ||
    claims.aud !== input.audience ||
    claims.source_product !== "giromesa" ||
    claims.target_product !== "doseclub" ||
    !claims.jti ||
    !claims.sub ||
    !claims.tenant_id ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > now + 5 ||
    claims.exp <= now ||
    claims.exp - claims.iat > 60
  ) {
    throw new Error("Invalid federation token claims");
  }

  return claims;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson<T>(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new Error("Invalid federation token payload");
  }
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
