import { describe, expect, it } from "vitest";
import { appendCancellationNotice, buildStockReversals } from "./cancellation-propagation";

describe("cancellation propagation", () => {
  it("adds a kitchen cancellation only once", () => {
    const first = appendCancellationNotice(
      { source: "table" },
      { itemId: "item-1", name: "Burger", reason: "Customer request" },
    );
    const second = appendCancellationNotice(first, {
      itemId: "item-1",
      name: "Burger",
      reason: "Customer request",
    });

    expect(second.cancellations).toHaveLength(1);
  });

  it("creates exact positive reversals for sale movements", () => {
    expect(
      buildStockReversals([
        { inventoryItemId: "beef", quantity: "-0.200", unitCostCents: 900 },
        { inventoryItemId: "bread", quantity: "-1", unitCostCents: 200 },
      ]),
    ).toEqual([
      { inventoryItemId: "beef", quantity: "0.2", unitCostCents: 900 },
      { inventoryItemId: "bread", quantity: "1", unitCostCents: 200 },
    ]);
  });
});
