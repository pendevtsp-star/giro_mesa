import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import Redis from "ioredis";
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
  private redis: Redis | null = null;

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
    this.redis?.disconnect();
    this.redis = null;
  }

  async assertDistributedAllowed(headers: HeaderRecord, rule: RateLimitRule) {
    if (process.env.NODE_ENV !== "production") {
      this.assertAllowed(headers, rule);
      return;
    }
    const identifier = readClientIdentifier(headers, rule.identifier);
    const key = `giromesa:rate-limit:${rule.namespace}:${identifier}`;
    if (!this.redis) {
      this.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
        connectTimeout: 1_000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        lazyConnect: true,
      });
    }
    const redis = this.redis;
    try {
      if (redis.status === "wait") await redis.connect();
      const result = await redis.eval(
        [
          "local count = redis.call('INCR', KEYS[1])",
          "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
          "return { count, redis.call('PTTL', KEYS[1]) }",
        ].join("\n"),
        1,
        key,
        String(rule.windowMs),
      );
      if (
        !Array.isArray(result) ||
        typeof result[0] !== "number" ||
        typeof result[1] !== "number"
      ) {
        throw new Error("Redis rate limit returned an invalid response");
      }
      const [count, ttl] = result;
      if (count > rule.limit) {
        throw new HttpException(
          {
            error: "rate_limited",
            retryAfterSeconds: Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000)),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: "rate_limit_unavailable", message: "Proteção temporariamente indisponível" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
