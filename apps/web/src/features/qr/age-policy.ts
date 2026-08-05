export function ageConfirmationStorageKey(tableCode: string) {
  return `giromesa:qr-age-confirmed:${tableCode}`;
}

export type StoredAgeConfirmation = {
  token: string;
  expiresAt: string;
};

export function parseStoredAgeConfirmation(
  raw: string | null,
  now = Date.now(),
): StoredAgeConfirmation | null {
  if (!raw || raw === "true") return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredAgeConfirmation>;
    if (
      typeof value.token !== "string" ||
      value.token.length < 16 ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= now
    ) {
      return null;
    }
    return { token: value.token, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export function hasValidAgeConfirmation(
  confirmation: StoredAgeConfirmation | null,
  now = Date.now(),
) {
  return Boolean(confirmation && Date.parse(confirmation.expiresAt) > now);
}

export function cartContainsAlcohol(
  cart: ReadonlyArray<{ productId: string; isAlcoholic?: boolean }>,
  products: ReadonlyArray<{ id: string; isAlcoholic?: boolean }>,
) {
  const currentClassification = new Map(
    products.map((product) => [product.id, product.isAlcoholic === true]),
  );
  return cart.some(
    (line) => line.isAlcoholic === true || currentClassification.get(line.productId) === true,
  );
}

export function requiresAgeConfirmation(
  products: ReadonlyArray<{ isAlcoholic?: boolean }>,
  confirmed: boolean,
) {
  return !confirmed && products.some((product) => product.isAlcoholic === true);
}
