export type Money = {
  amount: number;
  currency: "BRL";
};

export type OrderLine = {
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
  serviceChargeEligible?: boolean;
};

export type OrderTotalInput = {
  lines: OrderLine[];
  orderDiscountCents?: number;
  serviceChargeRate?: number;
  deliveryFeeCents?: number;
  couvertCents?: number;
};

export type OrderTotal = {
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  deliveryFeeCents: number;
  couvertCents: number;
  totalCents: number;
};

export function calculateOrderTotal(input: OrderTotalInput): OrderTotal {
  const subtotalCents = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceCents,
    0,
  );
  const lineDiscountCents = input.lines.reduce((sum, line) => sum + (line.discountCents ?? 0), 0);
  const discountCents = lineDiscountCents + (input.orderDiscountCents ?? 0);
  const serviceBase = input.lines
    .filter((line) => line.serviceChargeEligible ?? true)
    .reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCents - (line.discountCents ?? 0),
      0,
    );
  const serviceChargeCents = Math.max(0, Math.round(serviceBase * (input.serviceChargeRate ?? 0)));
  const deliveryFeeCents = input.deliveryFeeCents ?? 0;
  const couvertCents = input.couvertCents ?? 0;
  const totalCents = Math.max(
    0,
    subtotalCents - discountCents + serviceChargeCents + deliveryFeeCents + couvertCents,
  );

  return {
    subtotalCents,
    discountCents,
    serviceChargeCents,
    deliveryFeeCents,
    couvertCents,
    totalCents,
  };
}

export function splitAmount(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error("parts must be a positive integer");
  }

  const base = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;

  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}
