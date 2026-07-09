import { randomBytes } from "node:crypto";
import { hashOpaqueToken } from "./http";

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const token = randomBytes(5).toString("hex").toUpperCase();
    return `${token.slice(0, 5)}-${token.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string) {
  return hashOpaqueToken(normalizeRecoveryCode(code));
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
