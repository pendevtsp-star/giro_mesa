import { describe, expect, it } from "vitest";
import { createOauthState, verifyOauthState } from "./oauth-state";

describe("oauth-state", () => {
  it("creates and validates a signed state payload", () => {
    const state = createOauthState({
      provider: "google",
      mode: "link",
      userId: "user-1",
      returnTo: "/app",
    });

    const payload = verifyOauthState(state);

    expect(payload?.provider).toBe("google");
    expect(payload?.mode).toBe("link");
    expect(payload?.userId).toBe("user-1");
    expect(payload?.returnTo).toBe("/app");
  });

  it("rejects tampered state payloads", () => {
    const state = createOauthState({ provider: "google", returnTo: "/platform" });
    const tampered = `${state}x`;

    expect(verifyOauthState(tampered)).toBeNull();
  });
});
