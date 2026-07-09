import { describe, expect, it } from "vitest";
import { createOtpAuthUrl, generateTotpCode, generateTotpSecret, verifyTotpCode } from "./totp";

describe("totp", () => {
  it("generates and verifies a time based code", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, "000000", now)).toBe(false);
  });

  it("creates an otpauth URL for authenticator apps", () => {
    const url = createOtpAuthUrl({
      issuer: "GiroMesa",
      accountName: "admin@example.com",
      secret: "JBSWY3DPEHPK3PXP",
    });

    expect(url).toContain("otpauth://totp/GiroMesa:admin%40example.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
  });
});
