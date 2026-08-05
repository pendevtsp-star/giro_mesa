import { describe, expect, it } from "vitest";
import { appendTransferLine } from "./transfer-lines";

describe("transfer line editor", () => {
  it("builds a real multi-item transfer", () => {
    const first = appendTransferLine([], { inventoryItemId: "item-a", quantity: "2" });
    const second = appendTransferLine(first, { inventoryItemId: "item-b", quantity: "3,5" });

    expect(second).toEqual([
      { inventoryItemId: "item-a", quantity: "2" },
      { inventoryItemId: "item-b", quantity: "3.5" },
    ]);
  });

  it("rejects duplicate items and non-positive quantities", () => {
    const lines = appendTransferLine([], { inventoryItemId: "item-a", quantity: "1" });

    expect(() => appendTransferLine(lines, { inventoryItemId: "item-a", quantity: "2" })).toThrow(
      "duplicate-transfer-line",
    );
    expect(() => appendTransferLine([], { inventoryItemId: "item-b", quantity: "0" })).toThrow(
      "invalid-transfer-line",
    );
  });
});
