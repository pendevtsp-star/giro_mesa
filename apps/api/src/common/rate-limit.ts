import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { firstHeader, type HeaderRecord } from "./http";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitRule = {
  namespace: string;
  limit: number;
  windowMs: number;
  identifier?: string | undefined;
};

const buckets = new Map<string, Bucket>();

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function readClientIdentifier(headers: HeaderRecord, explicitIdentifier?: string) {
  if (explicitIdentifier) {
    return stableHash(explicitIdentifier);
  }

  const forwardedFor = firstHeader(headers["x-forwarded-for"]);
  if (forwardedFor) {
    return stableHash(forwardedFor.split(",")[0]?.trim() ?? forwardedFor);
  }

  return stableHash(firstHeader(headers["x-real-ip"]) ?? "unknown-client");
}

@Injectable()
export class RateLimitService {
  assertAllowed(headers: HeaderRecord, rule: RateLimitRule) {
    const now = Date.now();
    const identifier = readClientIdentifier(headers, rule.identifier);
    const key = `${rule.namespace}:${identifier}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + rule.windowMs,
      });
      return;
    }

    current.count += 1;
    if (current.count > rule.limit) {
      throw new HttpException(
        {
          error: "rate_limited",
          retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  clearForTests() {
    buckets.clear();
  }
}
