import { describe, expect, it } from "vitest";
import { corsOrigin, registerSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("returns the blocking API response policy", async () => {
    let onSend:
      | ((
          request: unknown,
          reply: { header(key: string, value: string): void },
          payload: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerSecurityHeaders({
      addHook(_name, handler) {
        onSend = handler;
      },
    });
    const headers: Record<string, string> = {};
    const payload = { ok: true };
    const returned = await onSend?.(
      {},
      {
        header(key, value) {
          headers[key] = value;
        },
      },
      payload,
    );

    expect(returned).toBe(payload);
    expect(headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "cross-origin-opener-policy": "same-origin",
    });
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
  });

  it("restricts production CORS to the configured application origin", () => {
    expect(corsOrigin("production", "https://app.giromesa.test")).toEqual([
      "https://app.giromesa.test",
    ]);
    expect(corsOrigin("development", "http://localhost:3002")).toBe(true);
  });
});
