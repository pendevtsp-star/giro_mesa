import type { OrderItemStatus } from "@giromesa/domain";

export function decideDiscountFlow(input: {
  subtotalCents: number;
  amountCents: number;
  maxDiscountWithoutApprovalBps: number;
}) {
  if (input.subtotalCents <= 0 || input.amountCents > input.subtotalCents) {
    return "invalid" as const;
  }
  const discountBps = Math.ceil((input.amountCents * 10_000) / input.subtotalCents);
  return discountBps <= input.maxDiscountWithoutApprovalBps
    ? ("apply" as const)
    : ("request_approval" as const);
}

export function requiresCancellationApproval(
  status: OrderItemStatus,
  requireApprovalAfterKitchen: boolean,
) {
  return requireApprovalAfterKitchen && ["sent", "preparing", "ready", "served"].includes(status);
}
