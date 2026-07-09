import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateTotpSecret(byteLength = 20) {
  return encodeBase32(randomBytes(byteLength));
}

export function createOtpAuthUrl(input: { issuer: string; accountName: string; secret: string }) {
  const issuer = encodeURIComponent(input.issuer);
  const accountName = encodeURIComponent(input.accountName);
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateTotpCode(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const lastByte = hmac.at(-1);
  if (lastByte === undefined) {
    throw new Error("Invalid TOTP digest");
  }

  const offset = lastByte & 0x0f;
  const byte0 = hmac.at(offset);
  const byte1 = hmac.at(offset + 1);
  const byte2 = hmac.at(offset + 2);
  const byte3 = hmac.at(offset + 3);
  if (byte0 === undefined || byte1 === undefined || byte2 === undefined || byte3 === undefined) {
    throw new Error("Invalid TOTP digest window");
  }

  const binary =
    ((byte0 & 0x7f) << 24) | ((byte1 & 0xff) << 16) | ((byte2 & 0xff) << 8) | (byte3 & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function verifyTotpCode(secret: string, code: string, now = Date.now(), window = 1) {
  const normalizedCode = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  for (let step = -window; step <= window; step += 1) {
    const expected = generateTotpCode(secret, now + step * TOTP_PERIOD_SECONDS * 1000);
    if (safeEqual(expected, normalizedCode)) {
      return true;
    }
  }

  return false;
}

function encodeBase32(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(secret: string) {
  const cleanSecret = secret.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleanSecret) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid TOTP secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
