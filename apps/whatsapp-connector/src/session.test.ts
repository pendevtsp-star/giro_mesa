import { describe, expect, it } from "vitest";
import { connectionFromUpdate, normalizeQr } from "./session";

describe("WhatsApp QR connector state", () => {
  it("maps connection updates without exposing session internals", () => {
    expect(connectionFromUpdate({ connection: "open" })).toBe("open");
    expect(connectionFromUpdate({ connection: "close" })).toBe("closed");
    expect(connectionFromUpdate({})).toBe("connecting");
  });

  it("bounds QR payloads before sending them to the API", () => {
    expect(normalizeQr("qr-value")).toBe("qr-value");
    expect(normalizeQr("x".repeat(4097))).toBeUndefined();
  });
});
