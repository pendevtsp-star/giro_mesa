import { describe, expect, it } from "vitest";
import { clubWhiskyEventTopics, clubWhiskyStockMovementTypes } from "./enums";

describe("club whisky integration contract", () => {
  it("declares stock movement types without treating dose consumption as another bottle sale", () => {
    expect(clubWhiskyStockMovementTypes).toEqual([
      "club_bottle_sale",
      "club_combo_sale",
      "club_dose_consumed",
      "club_adjustment",
      "club_refund",
    ]);
  });

  it("declares outbound event topics consumed by external platforms", () => {
    expect(clubWhiskyEventTopics).toContain("product.updated");
    expect(clubWhiskyEventTopics).toContain("stock.updated");
    expect(clubWhiskyEventTopics).toContain("order.closed");
    expect(clubWhiskyEventTopics).toContain("payment.confirmed");
    expect(clubWhiskyEventTopics).toContain("customer.updated");
    expect(clubWhiskyEventTopics).toContain("club.stock_movement.created");
  });
});
