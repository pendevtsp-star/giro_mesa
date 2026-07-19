import { describe, expect, it } from "vitest";
import { createCsrfToken, verifyCsrfToken } from "./csrf";

describe("csrf tokens", () => {
  const sessionToken = "session-token-for-tests";
  const secret = "test-secret-with-enough-entropy";

  it("validates a token bound to the current session cookie", () => {
    const token = createCsrfToken(sessionToken, secret);

    expect(verifyCsrfToken({ token, sessionToken, secret })).toBe(true);
  });

  it("rejects tokens for a different session", () => {
    const token = createCsrfToken(sessionToken, secret);

    expect(
      verifyCsrfToken({
        token,
        sessionToken: "another-session-token",
        secret,
      }),
    ).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(verifyCsrfToken({ token: "not-a-valid-token", sessionToken, secret })).toBe(false);
  });
});
