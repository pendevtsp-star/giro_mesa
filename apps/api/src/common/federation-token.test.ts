import { describe, expect, it } from "vitest";
import {
  type FederationClaims,
  signFederationToken,
  verifyFederationToken,
} from "./federation-token";

const claims: FederationClaims = {
  iss: "https://accounts.giromesa.com.br",
  aud: "doseclub",
  sub: "user-1",
  tenant_id: "tenant-1",
  source_product: "giromesa",
  target_product: "doseclub",
  jti: "handoff-1",
  iat: 1_000,
  exp: 1_060,
};

describe("federation token", () => {
  it("validates issuer, audience, signature, expiry and the 60 second ceiling", () => {
    const token = signFederationToken(claims, "secret");
    const encodedClaims = token.split(".")[1];
    const publicPayload = JSON.parse(
      Buffer.from(encodedClaims ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(publicPayload).not.toHaveProperty("email");
    expect(publicPayload).not.toHaveProperty("name");
    expect(publicPayload).not.toHaveProperty("entitlements");
    expect(
      verifyFederationToken(token, {
        secret: "secret",
        issuer: claims.iss,
        audience: "doseclub",
        now: 1_001,
      }),
    ).toEqual(claims);
    expect(() =>
      verifyFederationToken(`${token}x`, {
        secret: "secret",
        issuer: claims.iss,
        audience: "doseclub",
        now: 1_001,
      }),
    ).toThrow();
    expect(() =>
      verifyFederationToken(token, {
        secret: "secret",
        issuer: claims.iss,
        audience: "doseclub",
        now: 1_060,
      }),
    ).toThrow();
  });
});
