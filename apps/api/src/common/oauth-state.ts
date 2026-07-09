import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@giromesa/config";

type OauthStatePayload = {
  provider: "google";
  mode?: "login" | "link";
  userId?: string;
  returnTo?: string;
  exp: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;

export function createOauthState(input: {
  provider: "google";
  mode?: "login" | "link";
  userId?: string;
  returnTo?: string;
}) {
  const payload: OauthStatePayload = {
    provider: input.provider,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.returnTo ? { returnTo: input.returnTo } : {}),
    exp: Date.now() + STATE_TTL_MS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyOauthState(state: string | undefined) {
  if (!state) {
    return null;
  }

  const [encodedPayload, signature] = state.split(".");
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
      | OauthStatePayload
      | undefined;
    if (!payload || payload.provider !== "google" || payload.exp < Date.now()) {
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
