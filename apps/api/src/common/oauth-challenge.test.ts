import { describe, expect, it } from "vitest";
import { createOauthChallenge, verifyOauthChallenge } from "./oauth-challenge";

describe("oauth-challenge", () => {
  it("creates and validates a signed google mfa challenge", () => {
    const token = createOauthChallenge({
      kind: "google_mfa",
      userId: "user-1",
      tenantId: "tenant-1",
      providerUserId: "google-sub",
      email: "user@example.com",
      returnTo: "/app",
    });

    const payload = verifyOauthChallenge(token);

    expect(payload?.kind).toBe("google_mfa");
    expect(payload?.userId).toBe("user-1");
    expect(payload?.returnTo).toBe("/app");
  });

  it("rejects tampered tokens", () => {
    const token = createOauthChallenge({
      kind: "google_mfa",
      userId: "user-1",
      tenantId: "tenant-1",
      providerUserId: "google-sub",
      email: "user@example.com",
    });

    expect(verifyOauthChallenge(`${token}x`)).toBeNull();
  });
});
