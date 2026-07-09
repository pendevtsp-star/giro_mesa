import { describe, expect, it } from "vitest";
import { createIntegrationApiKey, hashIntegrationApiKey } from "./integration-key";

describe("integration api keys", () => {
  it("creates opaque keys and stores only a hashable representation", () => {
    const key = createIntegrationApiKey("club_whisky");

    expect(key.token).toMatch(/^gm_club_/);
    expect(key.tokenHash).toBe(hashIntegrationApiKey(key.token));
    expect(key.tokenHash).not.toContain(key.token);
    expect(key.lastFour).toBe(key.token.slice(-4));
  });

  it("uses a dedicated prefix for local printer connector keys", () => {
    const key = createIntegrationApiKey("local_printer_connector");

    expect(key.token).toMatch(/^gm_print_/);
    expect(key.tokenHash).toBe(hashIntegrationApiKey(key.token));
    expect(key.tokenHash).not.toContain(key.token);
  });
});
