import { describe, expect, it } from "vitest";
import { resolvePosShortcut } from "./pos-shortcuts";

describe("POS keyboard shortcuts", () => {
  it("maps the high-turnover actions to stable function keys", () => {
    expect(resolvePosShortcut("F2")).toBe("search");
    expect(resolvePosShortcut("F3")).toBe("toggle-mode");
    expect(resolvePosShortcut("F4")).toBe("receive");
    expect(resolvePosShortcut("F6")).toBe("focus-table");
    expect(resolvePosShortcut("F8")).toBe("production");
    expect(resolvePosShortcut("F9")).toBe("bill");
    expect(resolvePosShortcut("F10")).toBe("close");
    expect(resolvePosShortcut("Escape")).toBe("dismiss");
  });

  it("ignores printable keys so product and customer fields remain natural", () => {
    expect(resolvePosShortcut("a")).toBeNull();
    expect(resolvePosShortcut("Enter")).toBeNull();
  });
});
