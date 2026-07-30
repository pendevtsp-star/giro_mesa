import { describe, expect, it } from "vitest";
import { arrangeTablesForMerge, moveTablesInLayout } from "./salon-layout";

describe("moveTablesInLayout", () => {
  it("moves only the dragged table when it has no group", () => {
    const result = moveTablesInLayout(
      {
        "table-1": { x: 10, y: 20 },
        "table-2": { x: 30, y: 40 },
      },
      [
        { id: "table-1", groupId: null },
        { id: "table-2", groupId: null },
      ],
      "table-1",
      { x: 5, y: -3 },
    );

    expect(result).toEqual({
      "table-1": { x: 15, y: 17 },
      "table-2": { x: 30, y: 40 },
    });
  });

  it("moves every table in the dragged table group", () => {
    const result = moveTablesInLayout(
      {
        "table-1": { x: 10, y: 20 },
        "table-2": { x: 30, y: 40 },
        "table-3": { x: 50, y: 60 },
      },
      [
        { id: "table-1", groupId: "group-a" },
        { id: "table-2", groupId: "group-a" },
        { id: "table-3", groupId: null },
      ],
      "table-1",
      { x: 4, y: 6 },
    );

    expect(result).toEqual({
      "table-1": { x: 14, y: 26 },
      "table-2": { x: 34, y: 46 },
      "table-3": { x: 50, y: 60 },
    });
  });

  it("keeps a dragged group inside the visible map bounds", () => {
    const result = moveTablesInLayout(
      {
        "table-1": { x: 75, y: 70 },
        "table-2": { x: 85, y: 70 },
      },
      [
        { id: "table-1", groupId: "group-a" },
        { id: "table-2", groupId: "group-a" },
      ],
      "table-1",
      { x: 20, y: 20 },
      { maxX: 88, maxY: 78 },
    );

    expect(result).toEqual({
      "table-1": { x: 78, y: 78 },
      "table-2": { x: 88, y: 78 },
    });
  });
});

describe("arrangeTablesForMerge", () => {
  it("places merged tables beside the anchor and inside the viewport", () => {
    const result = arrangeTablesForMerge(
      {
        "table-1": { x: 82, y: 20 },
        "table-2": { x: 10, y: 70 },
      },
      ["table-1", "table-2"],
      { width: 1_000, height: 600, tableWidth: 175, tableHeight: 136, gap: 12 },
    );

    expect(result["table-1"]?.y).toBe(result["table-2"]?.y);
    expect(result["table-2"]?.x).toBeGreaterThan(result["table-1"]?.x ?? 0);
    expect(result["table-2"]?.x).toBeLessThanOrEqual(82.5);
  });
});
