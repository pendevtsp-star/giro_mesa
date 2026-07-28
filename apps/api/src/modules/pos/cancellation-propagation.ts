type CancellationNotice = {
  itemId: string;
  name: string;
  reason: string;
};

export function appendCancellationNotice(
  payload: Record<string, unknown>,
  notice: CancellationNotice,
) {
  const cancellations = Array.isArray(payload.cancellations)
    ? payload.cancellations.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  if (cancellations.some((entry) => entry.itemId === notice.itemId)) {
    return { ...payload, cancellations };
  }
  return {
    ...payload,
    cancellations: [...cancellations, notice],
  };
}

export function buildStockReversals(
  movements: Array<{
    inventoryItemId: string;
    quantity: string;
    unitCostCents: number;
  }>,
) {
  return movements.map((movement) => ({
    inventoryItemId: movement.inventoryItemId,
    quantity: String(Math.abs(Number(movement.quantity))),
    unitCostCents: movement.unitCostCents,
  }));
}
