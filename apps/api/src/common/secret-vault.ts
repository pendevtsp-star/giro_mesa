import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptSecret(plainText: string, keyMaterial?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString(
    "base64url",
  )}`;
}

export function decryptSecret(payload: string, keyMaterial?: string) {
  const [version, iv, authTag, encrypted] = payload.split(":");
  if (version !== "v1" || !iv || !authTag || !encrypted) {
    throw new Error("Invalid encrypted secret payload");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(keyMaterial),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey(keyMaterial?: string) {
  const configured =
    keyMaterial ?? process.env.MFA_SECRET_ENCRYPTION_KEY ?? "local-development-mfa-secret-key";
  return createHash("sha256").update(configured).digest();
}
