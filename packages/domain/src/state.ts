import type {
  ApprovalStatus,
  CashHandoverStatus,
  CashSessionStatus,
  FiscalStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  WaitlistStatus,
} from "./enums";

const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["opened", "canceled"],
  opened: ["sent_to_kitchen", "waiting_payment", "canceled"],
  sent_to_kitchen: ["preparing", "ready", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["served", "waiting_payment", "canceled"],
  served: ["waiting_payment", "partially_paid", "paid"],
  waiting_payment: ["partially_paid", "paid", "canceled"],
  partially_paid: ["paid", "refunded"],
  paid: ["refunded"],
  canceled: [],
  refunded: [],
};

const itemTransitions: Record<OrderItemStatus, OrderItemStatus[]> = {
  pending: ["sent", "canceled"],
  sent: ["preparing", "ready", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["served", "canceled"],
  served: ["refunded"],
  canceled: [],
  refunded: [],
};

const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["authorized", "confirmed", "failed", "canceled"],
  authorized: ["confirmed", "canceled"],
  confirmed: ["refunded", "partially_refunded"],
  failed: [],
  canceled: [],
  refunded: [],
  partially_refunded: ["refunded"],
};

const cashSessionTransitions: Record<CashSessionStatus, CashSessionStatus[]> = {
  open: ["closed", "disputed"],
  closed: ["reconciled", "disputed"],
  reconciled: [],
  disputed: ["reconciled"],
};

const fiscalTransitions: Record<FiscalStatus, FiscalStatus[]> = {
  not_required: ["pending"],
  pending: ["authorized", "rejected", "contingency", "error"],
  authorized: ["canceled"],
  rejected: ["pending", "error"],
  canceled: [],
  contingency: ["authorized", "error"],
  error: ["pending"],
};

const approvalTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ["approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

const cashHandoverTransitions: Record<CashHandoverStatus, CashHandoverStatus[]> = {
  not_required: [],
  pending: ["received", "disputed"],
  received: [],
  disputed: ["received"],
};

const reservationTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  booked: ["arrived", "no_show", "canceled"],
  arrived: ["seated", "no_show", "canceled"],
  seated: [],
  no_show: [],
  canceled: [],
};

const waitlistTransitions: Record<WaitlistStatus, WaitlistStatus[]> = {
  waiting: ["notified", "seated", "left", "canceled"],
  notified: ["seated", "left", "canceled"],
  seated: [],
  left: [],
  canceled: [],
};

function assertTransition<TStatus extends string>(
  transitions: Record<TStatus, TStatus[]>,
  from: TStatus,
  to: TStatus,
): void {
  if (!transitions[from]?.includes(to)) {
    throw new Error(`Invalid transition from ${from} to ${to}`);
  }
}

export const stateMachines = {
  assertOrderTransition: (from: OrderStatus, to: OrderStatus) =>
    assertTransition(orderTransitions, from, to),
  assertOrderItemTransition: (from: OrderItemStatus, to: OrderItemStatus) =>
    assertTransition(itemTransitions, from, to),
  assertPaymentTransition: (from: PaymentStatus, to: PaymentStatus) =>
    assertTransition(paymentTransitions, from, to),
  assertCashSessionTransition: (from: CashSessionStatus, to: CashSessionStatus) =>
    assertTransition(cashSessionTransitions, from, to),
  assertFiscalTransition: (from: FiscalStatus, to: FiscalStatus) =>
    assertTransition(fiscalTransitions, from, to),
  assertApprovalTransition: (from: ApprovalStatus, to: ApprovalStatus) =>
    assertTransition(approvalTransitions, from, to),
  assertCashHandoverTransition: (from: CashHandoverStatus, to: CashHandoverStatus) =>
    assertTransition(cashHandoverTransitions, from, to),
  assertReservationTransition: (from: ReservationStatus, to: ReservationStatus) =>
    assertTransition(reservationTransitions, from, to),
  assertWaitlistTransition: (from: WaitlistStatus, to: WaitlistStatus) =>
    assertTransition(waitlistTransitions, from, to),
};
