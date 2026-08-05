export type TransferDraftLine = {
  inventoryItemId: string;
  quantity: string;
};

export function appendTransferLine(
  lines: TransferDraftLine[],
  candidate: TransferDraftLine,
): TransferDraftLine[] {
  const inventoryItemId = candidate.inventoryItemId.trim();
  const quantity = Number(candidate.quantity.replace(",", "."));
  if (!inventoryItemId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("invalid-transfer-line");
  }
  if (lines.some((line) => line.inventoryItemId === inventoryItemId)) {
    throw new Error("duplicate-transfer-line");
  }
  return [...lines, { inventoryItemId, quantity: String(quantity) }];
}
