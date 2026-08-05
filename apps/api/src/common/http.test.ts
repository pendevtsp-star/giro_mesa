import { describe, expect, it } from "vitest";
import { createSessionToken, hashOpaqueToken, parseCookies, sessionCookie } from "./http";

describe("http session helpers", () => {
  it("hashes opaque session tokens deterministically without exposing the token", () => {
    const { token, tokenHash } = createSessionToken();

    expect(token).not.toEqual(tokenHash);
    expect(hashOpaqueToken(token)).toEqual(tokenHash);
  });

  it("creates secure cookie attributes for the session token", () => {
    const cookie = sessionCookie("abc", 60);

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=60");
    expect(cookie).not.toContain("Domain=localhost");
    expect(parseCookies(cookie).get("gm_session")).toBe("abc");
  });

  it("adds Secure to production session cookies", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      expect(sessionCookie("abc", 60)).toContain("Secure");
      expect(sessionCookie("abc", 60)).toContain("Path=/");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
