import { describe, expect, it } from "vitest";
import { resolveProductionRouting } from "./operational";

describe("production routing", () => {
  it("routes items by category and preserves printer-only stations", () => {
    const preview = resolveProductionRouting({
      orderId: "order-1",
      items: [
        { id: "food", name: "Burger", categoryId: "food-category" },
        { id: "drink", name: "Chopp", categoryId: "drink-category" },
        { id: "unknown", name: "Sem rota", categoryId: null },
      ],
      stations: [
        {
          id: "kitchen",
          name: "Cozinha",
          outputMode: "kds",
          productCategoryIds: ["food-category"],
        },
        {
          id: "bar",
          name: "Bar",
          outputMode: "printer",
          productCategoryIds: ["drink-category"],
        },
      ],
      printRoutes: [
        {
          id: "bar-route",
          stationId: "bar",
          printerDeviceId: "bar-printer",
          printerName: "Térmica Bar",
        },
      ],
    });

    expect(preview.destinations).toEqual([
      expect.objectContaining({ stationId: "kitchen", itemIds: ["food"], printers: [] }),
      expect.objectContaining({
        stationId: "bar",
        outputMode: "printer",
        itemIds: ["drink"],
        printers: [expect.objectContaining({ deviceId: "bar-printer" })],
      }),
    ]);
    expect(preview.unroutedItems.map((item) => item.id)).toEqual(["unknown"]);
  });
});
