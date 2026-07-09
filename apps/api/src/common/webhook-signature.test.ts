import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-signature";

describe("webhook signature", () => {
  const rawBody = JSON.stringify({ id: "evt_123", type: "club.stock_movement.created" });
  const timestamp = "2026-07-02T10:00:00.000Z";
  const nowMs = Date.parse(timestamp);
  const eventId = "evt_123";
  const secret = "test-secret";

  it("validates a matching HMAC signature", () => {
    const signature = signWebhookPayload({ secret, timestamp, eventId, rawBody });

    expect(
      verifyWebhookSignature({
        secret,
        signature,
        timestamp,
        eventId,
        rawBody,
        nowMs,
      }),
    ).toBe(true);
  });

  it("rejects missing or tampered signatures", () => {
    expect(
      verifyWebhookSignature({
        secret,
        signature: undefined,
        timestamp,
        eventId,
        rawBody,
        nowMs,
      }),
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        secret,
        signature: "sha256=invalid",
        timestamp,
        eventId,
        rawBody,
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects signatures outside the timestamp tolerance", () => {
    const signature = signWebhookPayload({ secret, timestamp, eventId, rawBody });

    expect(
      verifyWebhookSignature({
        secret,
        signature,
        timestamp,
        eventId,
        rawBody,
        nowMs: nowMs + 10 * 60 * 1000,
      }),
    ).toBe(false);
  });
});
