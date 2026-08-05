import { netChargeAllocations } from "../../common/payment-ledger";

export type ServicePolicyInput = {
  serviceRateBps: number;
  serviceBase: "net_consumption" | "gross_consumption" | "manual";
};

export function calculateServiceCharge(input: {
  subtotalCents: number;
  discountCents: number;
  cancelledCents?: number;
  policy: ServicePolicyInput;
  manualCents?: number;
}) {
  const grossBaseCents = Math.max(0, input.subtotalCents);
  const netBaseCents = Math.max(
    0,
    grossBaseCents - input.discountCents - (input.cancelledCents ?? 0),
  );
  const baseCents =
    input.policy.serviceBase === "gross_consumption"
      ? grossBaseCents
      : input.policy.serviceBase === "manual"
        ? 0
        : netBaseCents;
  const suggestedCents =
    input.policy.serviceBase === "manual"
      ? Math.max(0, input.manualCents ?? 0)
      : Math.floor((baseCents * input.policy.serviceRateBps + 5_000) / 10_000);
  return { grossBaseCents, netBaseCents, baseCents, suggestedCents };
}

export function proportionalShare(totalCents: number, numerator: number, denominator: number) {
  if (totalCents <= 0 || numerator <= 0 || denominator <= 0) return 0;
  return Math.floor((totalCents * numerator) / denominator);
}

export function distributeLargestRemainder(
  totalCents: number,
  weights: Array<{ userId: string; weight: number }>,
) {
  if (totalCents <= 0 || weights.length === 0) return new Map<string, number>();
  const grouped = new Map<string, number>();
  for (const entry of weights) {
    if (entry.weight <= 0) continue;
    grouped.set(entry.userId, (grouped.get(entry.userId) ?? 0) + entry.weight);
  }
  const normalized = [...grouped.entries()]
    .map(([userId, weight]) => ({ userId, weight }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return new Map<string, number>();
  const shares = normalized.map((entry) => ({
    ...entry,
    cents: Math.floor((totalCents * entry.weight) / totalWeight),
    remainder: (totalCents * entry.weight) % totalWeight,
  }));
  let remaining = totalCents - shares.reduce((sum, entry) => sum + entry.cents, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (let index = 0; index < shares.length && remaining > 0; index += 1, remaining -= 1) {
    const share = shares[index];
    if (share) share.cents += 1;
  }
  return new Map(shares.map((entry) => [entry.userId, entry.cents]));
}

export type SettlementItem = {
  id: string;
  totalCents: number;
  status: string;
  responsibleWaiterUserId: string | null;
  registeredByUserId: string | null;
};

export type SettlementOrder = {
  id: string;
  subtotalCents: number;
  discountCents: number;
  serviceChargeSuggestedCents: number;
  serviceChargeCents: number;
  items: SettlementItem[];
};

export type SettlementPayment = {
  paymentId: string;
  orderId: string | null;
  amountCents: number;
  status: string;
  paymentType: string;
  originalPaymentId: string | null;
  handover: "not_required" | "pending" | "received" | "disputed";
  registeredByUserId: string | null;
  registeredVia: string;
};

export type StaffSettlementBucket = {
  grossCents: number;
  cancelledCents: number;
  discountCents: number;
  netConsumptionCents: number;
  netPaidCents: number;
  serviceSuggestedCents: number;
  serviceReceivedCents: number;
  pendingCashCents: number;
  itemIds: string[];
};

export type ShiftSettlementCalculation = {
  buckets: Map<string, StaffSettlementBucket>;
  unassigned: StaffSettlementBucket;
  poolWeights: Array<{ userId: string; weight: number }>;
  breakdown: Record<string, unknown>;
};

const emptyBucket = (): StaffSettlementBucket => ({
  grossCents: 0,
  cancelledCents: 0,
  discountCents: 0,
  netConsumptionCents: 0,
  netPaidCents: 0,
  serviceSuggestedCents: 0,
  serviceReceivedCents: 0,
  pendingCashCents: 0,
  itemIds: [],
});

const unassignedBucketId = "__giromesa_unassigned__";

function distributeToBuckets(
  target: Map<string, StaffSettlementBucket>,
  unassigned: StaffSettlementBucket,
  total: number,
  weights: Array<{ userId: string; weight: number }>,
  field: keyof Omit<StaffSettlementBucket, "itemIds">,
) {
  const normalized = weights.filter((entry) => entry.weight > 0);
  const allocated = distributeLargestRemainder(total, normalized);
  const allocatedTotal = [...allocated.values()].reduce((sum, cents) => sum + cents, 0);
  for (const [userId, cents] of allocated) {
    if (userId === unassignedBucketId) {
      unassigned[field] += cents;
      continue;
    }
    const bucket = target.get(userId) ?? emptyBucket();
    bucket[field] += cents;
    target.set(userId, bucket);
  }
  unassigned[field] += Math.max(0, total - allocatedTotal);
  const result = new Map(allocated);
  const unassignedCents =
    (result.get(unassignedBucketId) ?? 0) + Math.max(0, total - allocatedTotal);
  if (unassignedCents > 0) result.set(unassignedBucketId, unassignedCents);
  return result;
}

type RecipientBreakdown = Omit<StaffSettlementBucket, "itemIds"> & { recipientId: string };

function poolCommercialWeights(
  items: SettlementItem[],
  poolWeights: Array<{ userId: string; weight: number }>,
) {
  const assignedCents = items
    .filter((item) => item.responsibleWaiterUserId || item.registeredByUserId)
    .reduce((sum, item) => sum + item.totalCents, 0);
  const unassignedCents = items
    .filter((item) => !item.responsibleWaiterUserId && !item.registeredByUserId)
    .reduce((sum, item) => sum + item.totalCents, 0);
  const poolWeight = poolWeights.reduce((sum, entry) => sum + entry.weight, 0);
  if (poolWeight <= 0 || assignedCents <= 0) {
    return unassignedCents + assignedCents > 0
      ? [{ userId: unassignedBucketId, weight: unassignedCents + assignedCents }]
      : [];
  }
  return [
    ...poolWeights.map((entry) => ({ userId: entry.userId, weight: entry.weight * assignedCents })),
    ...(unassignedCents > 0
      ? [{ userId: unassignedBucketId, weight: poolWeight * unassignedCents }]
      : []),
  ];
}

/**
 * Produces an immutable, cent-exact shift snapshot. Payment rows are evaluated per order,
 * never per recipient, so a partial payment cannot count service charge twice.
 */
export function calculateShiftSettlement(input: {
  orders: SettlementOrder[];
  payments: SettlementPayment[];
  attributionMode: "table_responsible" | "item_author" | "shift_pool";
  poolWeights?: Array<{ userId: string; weight: number }>;
}): ShiftSettlementCalculation {
  const buckets = new Map<string, StaffSettlementBucket>();
  const unassigned = emptyBucket();
  const poolWeights = [...(input.poolWeights ?? [])]
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const byOrder = new Map(input.orders.map((order) => [order.id, order]));
  const paymentsByOrder = new Map<string, SettlementPayment[]>();
  for (const payment of input.payments) {
    if (!payment.orderId || !byOrder.has(payment.orderId)) continue;
    const rows = paymentsByOrder.get(payment.orderId) ?? [];
    rows.push(payment);
    paymentsByOrder.set(payment.orderId, rows);
  }
  const orderBreakdowns: Array<Record<string, unknown>> = [];

  for (const order of input.orders) {
    const recipientBreakdowns = new Map<string, RecipientBreakdown>();
    const recordAllocations = (
      allocations: Map<string, number>,
      field: keyof Omit<StaffSettlementBucket, "itemIds">,
    ) => {
      for (const [recipientId, cents] of allocations) {
        const row = recipientBreakdowns.get(recipientId) ?? {
          recipientId,
          grossCents: 0,
          cancelledCents: 0,
          discountCents: 0,
          netConsumptionCents: 0,
          netPaidCents: 0,
          serviceSuggestedCents: 0,
          serviceReceivedCents: 0,
          pendingCashCents: 0,
        };
        row[field] += cents;
        recipientBreakdowns.set(recipientId, row);
      }
    };
    const distributeCommercial = (
      total: number,
      weights: Array<{ userId: string; weight: number }>,
      field: keyof Omit<StaffSettlementBucket, "itemIds">,
    ) => {
      recordAllocations(distributeToBuckets(buckets, unassigned, total, weights, field), field);
    };
    const activeItems = order.items.filter(
      (item) => !["canceled", "refunded"].includes(item.status),
    );
    const cancelledItems = order.items.filter((item) =>
      ["canceled", "refunded"].includes(item.status),
    );
    const eligibleItems = activeItems.map((item) => ({
      item,
      userId:
        input.attributionMode === "table_responsible"
          ? item.responsibleWaiterUserId
          : input.attributionMode === "item_author"
            ? item.registeredByUserId
            : null,
    }));
    const weights =
      input.attributionMode === "shift_pool"
        ? poolCommercialWeights(activeItems, poolWeights)
        : eligibleItems.map((entry) => ({
            userId: entry.userId ?? unassignedBucketId,
            weight: entry.item.totalCents,
          }));
    const cancelledWeights =
      input.attributionMode === "shift_pool"
        ? poolCommercialWeights(cancelledItems, poolWeights)
        : cancelledItems.map((item) => ({
            userId:
              input.attributionMode === "table_responsible"
                ? (item.responsibleWaiterUserId ?? unassignedBucketId)
                : (item.registeredByUserId ?? unassignedBucketId),
            weight: item.totalCents,
          }));
    const activeSubtotal = activeItems.reduce((sum, item) => sum + item.totalCents, 0);
    const cancelledCents = cancelledItems.reduce((sum, item) => sum + item.totalCents, 0);
    const netAllocations = netChargeAllocations(paymentsByOrder.get(order.id) ?? []);
    const receivedAllocations = netAllocations.filter(({ payment }) =>
      ["received", "not_required"].includes(payment.handover),
    );
    const receivedCents = receivedAllocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0,
    );
    const pendingPayments = netAllocations.filter(
      ({ payment }) =>
        payment.registeredVia === "waiter" && ["pending", "disputed"].includes(payment.handover),
    );
    const pendingCashCents = Math.max(
      0,
      pendingPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
    );
    const chargeReceivedCents = Math.min(
      Math.max(0, order.serviceChargeCents),
      Math.floor(
        (Math.min(
          Math.max(0, receivedCents),
          Math.max(0, order.subtotalCents - order.discountCents + order.serviceChargeCents),
        ) *
          Math.max(0, order.serviceChargeCents)) /
          Math.max(1, order.subtotalCents - order.discountCents + order.serviceChargeCents),
      ),
    );
    distributeCommercial(activeSubtotal, weights, "grossCents");
    distributeCommercial(cancelledCents, cancelledWeights, "cancelledCents");
    distributeCommercial(Math.min(order.discountCents, activeSubtotal), weights, "discountCents");
    distributeCommercial(order.serviceChargeSuggestedCents, weights, "serviceSuggestedCents");
    distributeCommercial(chargeReceivedCents, weights, "serviceReceivedCents");
    const netPaidCents = Math.max(
      0,
      Math.min(
        receivedCents,
        Math.max(0, order.subtotalCents - order.discountCents + order.serviceChargeCents),
      ) - chargeReceivedCents,
    );
    distributeCommercial(netPaidCents, weights, "netPaidCents");
    distributeCommercial(netPaidCents, weights, "netConsumptionCents");
    for (const { payment, amountCents } of pendingPayments) {
      const recipientId = payment.registeredByUserId ?? unassignedBucketId;
      if (recipientId === unassignedBucketId) {
        unassigned.pendingCashCents += amountCents;
      } else {
        const bucket = buckets.get(recipientId) ?? emptyBucket();
        bucket.pendingCashCents += amountCents;
        buckets.set(recipientId, bucket);
      }
      recordAllocations(new Map([[recipientId, amountCents]]), "pendingCashCents");
    }
    for (const entry of eligibleItems) {
      if (!entry.userId || input.attributionMode === "shift_pool") continue;
      const bucket = buckets.get(entry.userId) ?? emptyBucket();
      bucket.itemIds.push(entry.item.id);
      buckets.set(entry.userId, bucket);
    }
    orderBreakdowns.push({
      orderId: order.id,
      activeSubtotalCents: activeSubtotal,
      cancelledCents,
      discountCents: Math.min(order.discountCents, activeSubtotal),
      serviceSuggestedCents: order.serviceChargeSuggestedCents,
      serviceChargedCents: order.serviceChargeCents,
      serviceReceivedCents: chargeReceivedCents,
      netPaidCents,
      eligiblePaymentCents: receivedCents,
      pendingCashCents,
      recipients: [...recipientBreakdowns.values()]
        .map((recipient) => ({ ...recipient }))
        .sort((left, right) => left.recipientId.localeCompare(right.recipientId)),
      paymentCollectors: pendingPayments.map(({ payment, amountCents }) => ({
        paymentId: payment.paymentId,
        originalPaymentId: payment.originalPaymentId,
        paymentType: payment.paymentType,
        recipientId: payment.registeredByUserId ?? unassignedBucketId,
        amountCents,
        registeredVia: payment.registeredVia,
        handover: payment.handover,
      })),
    });
  }
  return {
    buckets,
    unassigned,
    poolWeights,
    breakdown: { orders: orderBreakdowns, unassigned, poolWeights },
  };
}

export type CommissionRule = { startCents: number; endCents?: number | undefined; rateBps: number };

export function calculateCommission(input: {
  baseCents: number;
  model: "fixed_rate" | "whole_band" | "progressive_bands" | "target_bonus" | "rate_plus_bonus";
  rules: {
    rateBps?: number | undefined;
    targetCents?: number | undefined;
    bonusCents?: number | undefined;
    bands?: CommissionRule[] | undefined;
  };
}) {
  const baseCents = Math.max(0, input.baseCents);
  const rate = (amount: number, bps: number) =>
    Math.floor((amount * Math.max(0, bps) + 5_000) / 10_000);
  const bands = [...(input.rules.bands ?? [])].sort((a, b) => a.startCents - b.startCents);
  const wholeBand = () => {
    const matched = bands.find(
      (band, index) =>
        baseCents >= band.startCents &&
        (band.endCents === undefined || baseCents < band.endCents || index === bands.length - 1),
    );
    return matched ? rate(baseCents, matched.rateBps) : 0;
  };
  const progressive = () =>
    bands.reduce((sum, band, index) => {
      const nextBand = bands[index + 1];
      const end = band.endCents ?? (index === bands.length - 1 ? baseCents : nextBand?.startCents);
      if (end === undefined) return sum;
      return sum + rate(Math.max(0, Math.min(baseCents, end) - band.startCents), band.rateBps);
    }, 0);
  const bonus =
    input.rules.targetCents && baseCents >= input.rules.targetCents
      ? Math.max(0, input.rules.bonusCents ?? 0)
      : 0;
  if (input.model === "whole_band") return wholeBand();
  if (input.model === "progressive_bands") return progressive();
  if (input.model === "target_bonus") return bonus;
  if (input.model === "rate_plus_bonus") return rate(baseCents, input.rules.rateBps ?? 0) + bonus;
  return rate(baseCents, input.rules.rateBps ?? 0);
}
