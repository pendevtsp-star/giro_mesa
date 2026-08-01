import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "./app-dashboard";

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1.234", 123400],
  ])("parses %s as %s cents", (value, expected) => {
    expect(parseMoneyToCents(value)).toBe(expected);
  });
});
