import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertTableCanSeatParty } from "./floor-rules";

describe("assertTableCanSeatParty", () => {
  it("allows an available table with enough seats", () => {
    expect(() => assertTableCanSeatParty({ status: "free", seats: 4 }, 4)).not.toThrow();
  });

  it("rejects blocked or occupied tables", () => {
    expect(() => assertTableCanSeatParty({ status: "blocked", seats: 8 }, 4)).toThrow(
      BadRequestException,
    );
    expect(() => assertTableCanSeatParty({ status: "occupied", seats: 8 }, 4)).toThrow(
      BadRequestException,
    );
  });

  it("rejects tables below reservation capacity", () => {
    expect(() => assertTableCanSeatParty({ status: "free", seats: 2 }, 4)).toThrow(
      "Table capacity is insufficient",
    );
  });
});
