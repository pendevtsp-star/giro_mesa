import { createHmac, timingSafeEqual } from "node:crypto";

export function webhookSignaturePayload(input: {
  timestamp: string;
  eventId: string;
  rawBody: Buffer | string;
}) {
  const body = Buffer.isBuffer(input.rawBody) ? input.rawBody.toString("utf8") : input.rawBody;
  return `${input.timestamp}.${input.eventId}.${body}`;
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: Buffer | string;
}) {
  return `sha256=${createHmac("sha256", input.secret)
    .update(
      webhookSignaturePayload({
        timestamp: input.timestamp,
        eventId: input.eventId,
        rawBody: input.rawBody,
      }),
    )
    .digest("hex")}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
  eventId: string;
  rawBody: Buffer | string | undefined;
  nowMs?: number;
  maxAgeMs?: number;
}) {
  if (!input.signature || !input.timestamp || !input.rawBody) {
    return false;
  }

  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 5 * 60 * 1000;
  if (Math.abs(nowMs - timestampMs) > maxAgeMs) {
    return false;
  }

  const expected = signWebhookPayload({
    secret: input.secret,
    timestamp: input.timestamp,
    eventId: input.eventId,
    rawBody: input.rawBody,
  });

  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyRawBodyHmacSignature(input: {
  secret: string;
  signature: string | undefined;
  rawBody: Buffer | string | undefined;
}) {
  if (!input.signature || !input.rawBody) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", input.secret)
    .update(input.rawBody)
    .digest("hex")}`;

  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
