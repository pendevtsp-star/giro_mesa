export const orderStatuses = [
  "draft",
  "opened",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "served",
  "waiting_payment",
  "partially_paid",
  "paid",
  "canceled",
  "refunded",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const orderItemStatuses = [
  "pending",
  "sent",
  "preparing",
  "ready",
  "served",
  "canceled",
  "refunded",
] as const;

export type OrderItemStatus = (typeof orderItemStatuses)[number];

export const paymentStatuses = [
  "pending",
  "authorized",
  "confirmed",
  "failed",
  "canceled",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export const cashSessionStatuses = ["open", "closed", "reconciled", "disputed"] as const;
export type CashSessionStatus = (typeof cashSessionStatuses)[number];

export const fiscalStatuses = [
  "not_required",
  "pending",
  "authorized",
  "rejected",
  "canceled",
  "contingency",
  "error",
] as const;

export type FiscalStatus = (typeof fiscalStatuses)[number];

export const tableStatuses = [
  "free",
  "occupied",
  "waiting_order",
  "order_sent",
  "preparing",
  "served",
  "waiting_payment",
  "reserved",
  "blocked",
] as const;

export type TableStatus = (typeof tableStatuses)[number];

export const paymentMethods = [
  "cash",
  "pix_manual",
  "pix_integrated",
  "credit_card",
  "debit_card",
  "meal_voucher",
  "voucher",
  "internal_credit",
  "courtesy",
  "invoiced",
] as const;

export type PaymentMethod = (typeof paymentMethods)[number];
