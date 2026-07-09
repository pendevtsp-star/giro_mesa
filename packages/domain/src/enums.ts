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

export const printJobStatuses = ["pending", "printing", "printed", "failed", "canceled"] as const;
export type PrintJobStatus = (typeof printJobStatuses)[number];

export const printerRoles = ["kitchen", "bar", "cashier", "conference", "fiscal"] as const;
export type PrinterRole = (typeof printerRoles)[number];

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

export const clubWhiskyStockMovementTypes = [
  "club_bottle_sale",
  "club_combo_sale",
  "club_dose_consumed",
  "club_adjustment",
  "club_refund",
] as const;

export type ClubWhiskyStockMovementType = (typeof clubWhiskyStockMovementTypes)[number];

export const clubWhiskyEventTopics = [
  "product.updated",
  "stock.updated",
  "order.closed",
  "payment.confirmed",
  "customer.updated",
  "club.stock_movement.created",
] as const;

export type ClubWhiskyEventTopic = (typeof clubWhiskyEventTopics)[number];
