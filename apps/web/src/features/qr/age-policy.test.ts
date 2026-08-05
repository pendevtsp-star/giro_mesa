import { describe, expect, it } from "vitest";
import {
  ageConfirmationStorageKey,
  cartContainsAlcohol,
  hasValidAgeConfirmation,
  parseStoredAgeConfirmation,
  requiresAgeConfirmation,
} from "./age-policy";

describe("QR alcohol age policy", () => {
  it("requires confirmation for every explicitly alcoholic product", () => {
    expect(requiresAgeConfirmation([{ isAlcoholic: true }], false)).toBe(true);
    expect(requiresAgeConfirmation([{ isAlcoholic: false }, {}], false)).toBe(false);
    expect(requiresAgeConfirmation([{ isAlcoholic: true }], true)).toBe(false);
  });

  it("scopes confirmation to the QR token or table code", () => {
    expect(ageConfirmationStorageKey("tenant-a.table-1.token-a")).not.toBe(
      ageConfirmationStorageKey("tenant-b.table-1.token-b"),
    );
  });

  it("reclassifies a legacy persisted cart from the current menu", () => {
    const legacyCart = [{ productId: "whisky-1" }];
    expect(
      cartContainsAlcohol(legacyCart, [
        { id: "water-1", isAlcoholic: false },
        { id: "whisky-1", isAlcoholic: true },
      ]),
    ).toBe(true);
    expect(cartContainsAlcohol([{ productId: "water-1" }], [{ id: "water-1" }])).toBe(false);
  });

  it("rejects legacy booleans, malformed tokens and expired confirmations", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    expect(parseStoredAgeConfirmation("true", now)).toBeNull();
    expect(parseStoredAgeConfirmation("not-json", now)).toBeNull();
    expect(
      parseStoredAgeConfirmation(
        JSON.stringify({ token: "signed-age-confirmation", expiresAt: "2026-08-03T11:59:59.000Z" }),
        now,
      ),
    ).toBeNull();

    const valid = parseStoredAgeConfirmation(
      JSON.stringify({ token: "signed-age-confirmation", expiresAt: "2026-08-03T12:30:00.000Z" }),
      now,
    );
    expect(hasValidAgeConfirmation(valid, now)).toBe(true);
  });
});
