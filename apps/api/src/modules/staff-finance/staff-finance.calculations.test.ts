import { describe, expect, it } from "vitest";
import {
  calculateCommission,
  calculateServiceCharge,
  calculateShiftSettlement,
  distributeLargestRemainder,
} from "./staff-finance.calculations";

describe("staff finance calculations", () => {
  it("keeps service cents exact across recipients", () => {
    expect(
      [
        ...distributeLargestRemainder(10, [
          { userId: "b", weight: 1 },
          { userId: "a", weight: 2 },
        ]).values(),
      ].reduce((a, b) => a + b, 0),
    ).toBe(10);
  });
  it("supports net and manual service charge", () => {
    expect(
      calculateServiceCharge({
        subtotalCents: 10_000,
        discountCents: 1_000,
        policy: { serviceRateBps: 1_000, serviceBase: "net_consumption" },
      }).suggestedCents,
    ).toBe(900);
    expect(
      calculateServiceCharge({
        subtotalCents: 10_000,
        discountCents: 0,
        manualCents: 777,
        policy: { serviceRateBps: 0, serviceBase: "manual" },
      }).suggestedCents,
    ).toBe(777);
  });
  it("applies progressive bands only to each interval", () => {
    expect(
      calculateCommission({
        baseCents: 15_000,
        model: "progressive_bands",
        rules: {
          bands: [
            { startCents: 0, endCents: 10_000, rateBps: 1_000 },
            { startCents: 10_000, rateBps: 2_000 },
          ],
        },
      }),
    ).toBe(2_000);
  });

  it("counts service charge once per order with partial and split payments", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "item_author",
      orders: [
        {
          id: "order-1",
          subtotalCents: 10_000,
          discountCents: 0,
          serviceChargeSuggestedCents: 1_000,
          serviceChargeCents: 1_000,
          items: [
            {
              id: "item-1",
              totalCents: 10_000,
              status: "served",
              responsibleWaiterUserId: "waiter-1",
              registeredByUserId: "waiter-1",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "split-charge-a",
          orderId: "order-1",
          amountCents: 5_500,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
        {
          paymentId: "split-charge-b",
          orderId: "order-1",
          amountCents: 5_500,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.get("waiter-1")?.serviceReceivedCents).toBe(1_000);
    expect(calculation.buckets.get("waiter-1")?.netPaidCents).toBe(10_000);
  });

  it("removes paid consumption and service after a fully linked refund", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "table_responsible",
      orders: [
        {
          id: "refunded-order",
          subtotalCents: 1_000,
          discountCents: 0,
          serviceChargeSuggestedCents: 100,
          serviceChargeCents: 100,
          items: [
            {
              id: "refunded-item",
              totalCents: 1_000,
              status: "served",
              responsibleWaiterUserId: "waiter",
              registeredByUserId: "waiter",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "charge",
          orderId: "refunded-order",
          amountCents: 1_100,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
        {
          paymentId: "refund",
          orderId: "refunded-order",
          amountCents: 1_100,
          status: "refunded",
          paymentType: "refund",
          originalPaymentId: "charge",
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.get("waiter")).toMatchObject({
      netConsumptionCents: 0,
      netPaidCents: 0,
      serviceReceivedCents: 0,
      pendingCashCents: 0,
    });
  });

  it("reduces net confirmed consumption and commission proportionally after a partial refund", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "table_responsible",
      orders: [
        {
          id: "partially-refunded-order",
          subtotalCents: 1_000,
          discountCents: 0,
          serviceChargeSuggestedCents: 100,
          serviceChargeCents: 100,
          items: [
            {
              id: "partially-refunded-item",
              totalCents: 1_000,
              status: "served",
              responsibleWaiterUserId: "waiter",
              registeredByUserId: "waiter",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "partial-charge",
          orderId: "partially-refunded-order",
          amountCents: 1_100,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
        {
          paymentId: "partial-refund",
          orderId: "partially-refunded-order",
          amountCents: 550,
          status: "refunded",
          paymentType: "refund",
          originalPaymentId: "partial-charge",
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
      ],
    });
    const bucket = calculation.buckets.get("waiter");
    expect(bucket).toMatchObject({
      grossCents: 1_000,
      netConsumptionCents: 500,
      netPaidCents: 500,
      serviceReceivedCents: 50,
    });
    expect(
      calculateCommission({
        baseCents: bucket?.netConsumptionCents ?? 0,
        model: "fixed_rate",
        rules: { rateBps: 1_000 },
      }),
    ).toBe(50);
  });

  it("keeps pending cash out of received service and preserves unassigned and pool totals", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "shift_pool",
      poolWeights: [
        { userId: "waiter-a", weight: 2 },
        { userId: "waiter-b", weight: 1 },
      ],
      orders: [
        {
          id: "order-1",
          subtotalCents: 100,
          discountCents: 0,
          serviceChargeSuggestedCents: 10,
          serviceChargeCents: 10,
          items: [
            {
              id: "item-1",
              totalCents: 100,
              status: "served",
              responsibleWaiterUserId: null,
              registeredByUserId: null,
            },
          ],
        },
        {
          id: "order-2",
          subtotalCents: 50,
          discountCents: 0,
          serviceChargeSuggestedCents: 5,
          serviceChargeCents: 5,
          items: [
            {
              id: "item-2",
              totalCents: 50,
              status: "served",
              responsibleWaiterUserId: null,
              registeredByUserId: null,
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "pool-pending-charge",
          orderId: "order-1",
          amountCents: 110,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "pending",
          registeredByUserId: "waiter-a",
          registeredVia: "waiter",
        },
        {
          paymentId: "pool-received-charge",
          orderId: "order-2",
          amountCents: 55,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "received",
          registeredByUserId: "cashier",
          registeredVia: "cashier",
        },
      ],
    });
    const totals = [...calculation.buckets.values()].reduce(
      (result, bucket) => ({
        service: result.service + bucket.serviceReceivedCents,
        pending: result.pending + bucket.pendingCashCents,
        gross: result.gross + bucket.grossCents,
      }),
      { service: 0, pending: 0, gross: 0 },
    );
    expect(totals).toEqual({ service: 0, pending: 110, gross: 0 });
    expect(calculation.unassigned).toMatchObject({ grossCents: 150, serviceReceivedCents: 5 });
  });

  it("retains QR or unassigned consumption in the managerial bucket", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "item_author",
      orders: [
        {
          id: "qr-order",
          subtotalCents: 500,
          discountCents: 0,
          serviceChargeSuggestedCents: 50,
          serviceChargeCents: 50,
          items: [
            {
              id: "qr-item",
              totalCents: 500,
              status: "served",
              responsibleWaiterUserId: null,
              registeredByUserId: null,
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "qr-charge",
          orderId: "qr-order",
          amountCents: 550,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.size).toBe(0);
    expect(calculation.unassigned).toMatchObject({
      grossCents: 500,
      serviceReceivedCents: 50,
      netPaidCents: 500,
    });
  });

  it("aggregates repeated recipient weights before distributing the largest remainder", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "item_author",
      orders: [
        {
          id: "repeated-author",
          subtotalCents: 200,
          discountCents: 0,
          serviceChargeSuggestedCents: 20,
          serviceChargeCents: 20,
          items: [
            {
              id: "item-a",
              totalCents: 100,
              status: "served",
              responsibleWaiterUserId: "waiter",
              registeredByUserId: "waiter",
            },
            {
              id: "item-b",
              totalCents: 100,
              status: "served",
              responsibleWaiterUserId: "waiter",
              registeredByUserId: "waiter",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "repeated-author-charge",
          orderId: "repeated-author",
          amountCents: 220,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "not_required",
          registeredByUserId: null,
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.get("waiter")).toMatchObject({
      grossCents: 200,
      serviceReceivedCents: 20,
      netPaidCents: 200,
    });
    expect(calculation.unassigned).toMatchObject({
      grossCents: 0,
      serviceReceivedCents: 0,
      netPaidCents: 0,
    });
  });

  it("preserves the unassigned fraction of a mixed order cent by cent", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "table_responsible",
      orders: [
        {
          id: "mixed-order",
          subtotalCents: 200,
          discountCents: 0,
          serviceChargeSuggestedCents: 20,
          serviceChargeCents: 20,
          items: [
            {
              id: "assigned",
              totalCents: 100,
              status: "served",
              responsibleWaiterUserId: "waiter",
              registeredByUserId: "manager",
            },
            {
              id: "qr",
              totalCents: 100,
              status: "served",
              responsibleWaiterUserId: null,
              registeredByUserId: null,
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "mixed-order-charge",
          orderId: "mixed-order",
          amountCents: 220,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "received",
          registeredByUserId: "cashier",
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.get("waiter")).toMatchObject({
      grossCents: 100,
      serviceReceivedCents: 10,
      netPaidCents: 100,
    });
    expect(calculation.unassigned).toMatchObject({
      grossCents: 100,
      serviceReceivedCents: 10,
      netPaidCents: 100,
    });
  });

  it("assigns waiter cash only to the collector, independently from the commercial owner", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "table_responsible",
      orders: [
        {
          id: "collector-order",
          subtotalCents: 1_000,
          discountCents: 1,
          serviceChargeSuggestedCents: 100,
          serviceChargeCents: 100,
          items: [
            {
              id: "collector-item",
              totalCents: 1_000,
              status: "served",
              responsibleWaiterUserId: "owner",
              registeredByUserId: "author",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "collector-charge",
          orderId: "collector-order",
          amountCents: 1_099,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "pending",
          registeredByUserId: "collector",
          registeredVia: "waiter",
        },
      ],
    });
    expect(calculation.buckets.get("owner")).toMatchObject({
      grossCents: 1_000,
      discountCents: 1,
      pendingCashCents: 0,
    });
    expect(calculation.buckets.get("collector")).toMatchObject({
      grossCents: 0,
      pendingCashCents: 1_099,
    });
    const order = (calculation.breakdown.orders as Array<Record<string, unknown>>)[0];
    expect(order?.recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientId: "owner", grossCents: 1_000, discountCents: 1 }),
        expect.objectContaining({ recipientId: "collector", pendingCashCents: 1_099 }),
      ]),
    );
  });

  it("keeps received cashier money out of waiter handover and assigns disputed waiter cash", () => {
    const calculation = calculateShiftSettlement({
      attributionMode: "shift_pool",
      poolWeights: [{ userId: "pool-waiter", weight: 1 }],
      orders: [
        {
          id: "cash-status-order",
          subtotalCents: 200,
          discountCents: 0,
          serviceChargeSuggestedCents: 0,
          serviceChargeCents: 0,
          items: [
            {
              id: "cash-status-item",
              totalCents: 200,
              status: "served",
              responsibleWaiterUserId: "owner",
              registeredByUserId: "author",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "cash-status-received",
          orderId: "cash-status-order",
          amountCents: 100,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "received",
          registeredByUserId: "cashier",
          registeredVia: "cashier",
        },
        {
          paymentId: "cash-status-disputed",
          orderId: "cash-status-order",
          amountCents: 100,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "disputed",
          registeredByUserId: "collector",
          registeredVia: "waiter",
        },
      ],
    });
    expect(calculation.buckets.get("pool-waiter")?.pendingCashCents).toBe(0);
    expect(calculation.buckets.get("cashier")).toBeUndefined();
    expect(calculation.buckets.get("collector")?.pendingCashCents).toBe(100);
  });

  it("preserves every cent when a busy shift is split among 12 waiters", () => {
    const waiters = Array.from({ length: 12 }, (_, index) => ({
      userId: `waiter-${String(index + 1).padStart(2, "0")}`,
      weight: index + 1,
    }));
    const calculation = calculateShiftSettlement({
      attributionMode: "shift_pool",
      poolWeights: waiters,
      orders: [
        {
          id: "busy-friday",
          subtotalCents: 1_234_567,
          discountCents: 12_345,
          serviceChargeSuggestedCents: 122_222,
          serviceChargeCents: 122_222,
          items: [
            {
              id: "busy-item",
              totalCents: 1_234_567,
              status: "served",
              responsibleWaiterUserId: "waiter-01",
              registeredByUserId: "waiter-02",
            },
          ],
        },
      ],
      payments: [
        {
          paymentId: "busy-friday-charge",
          orderId: "busy-friday",
          amountCents: 1_344_444,
          status: "confirmed",
          paymentType: "charge",
          originalPaymentId: null,
          handover: "received",
          registeredByUserId: "cashier",
          registeredVia: "cashier",
        },
      ],
    });
    expect(calculation.buckets.size).toBe(12);
    const totals = [...calculation.buckets.values()].reduce(
      (sum, bucket) => ({
        gross: sum.gross + bucket.grossCents,
        discount: sum.discount + bucket.discountCents,
        service: sum.service + bucket.serviceReceivedCents,
        net: sum.net + bucket.netPaidCents,
      }),
      { gross: 0, discount: 0, service: 0, net: 0 },
    );
    expect(totals).toEqual({
      gross: 1_234_567,
      discount: 12_345,
      service: 122_222,
      net: 1_222_222,
    });
    expect(calculation.unassigned.grossCents).toBe(0);
  });
});
