import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@giromesa/config";

type OauthChallengePayload = {
  kind: "google_mfa";
  userId: string;
  tenantId: string | null;
  providerUserId: string;
  email: string;
  returnTo?: string;
  exp: number;
};

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function createOauthChallenge(input: Omit<OauthChallengePayload, "exp">) {
  const payload: OauthChallengePayload = {
    ...input,
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyOauthChallenge(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as
      | OauthChallengePayload
      | undefined;
    if (payload?.kind !== "google_mfa" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sign(value: string) {
  return createHmac("sha256", loadEnv().SESSION_SECRET).update(value).digest("base64url");
}
