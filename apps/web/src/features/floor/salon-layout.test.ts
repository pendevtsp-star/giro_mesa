import { describe, expect, it } from "vitest";
import { moveTablesInLayout } from "./salon-layout";

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
});
