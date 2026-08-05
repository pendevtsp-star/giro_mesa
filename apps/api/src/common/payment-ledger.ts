import { payments } from "@giromesa/db";
import { sql } from "drizzle-orm";

export type PaymentLedgerRow = {
  id?: string;
  paymentId?: string;
  amountCents: number;
  status: string;
  paymentType?: string | null;
  originalPaymentId?: string | null;
};

/**
 * Canonical financial sign convention used throughout GiroMesa.
 * Confirmed charges add value; completed, linked refunds compensate it.
 */
export function paymentLedgerDeltaCents(payment: PaymentLedgerRow) {
  if (
    payment.paymentType === "refund" &&
    payment.status === "refunded" &&
    payment.originalPaymentId
  ) {
    return -Math.abs(payment.amountCents);
  }
  if ((payment.paymentType ?? "charge") === "charge" && payment.status === "confirmed") {
    return Math.abs(payment.amountCents);
  }
  return 0;
}

export function netPaymentCents(rows: PaymentLedgerRow[]) {
  return rows.reduce((sum, row) => sum + paymentLedgerDeltaCents(row), 0);
}

export function netChargeAllocations<T extends PaymentLedgerRow>(rows: T[]) {
  const refundsByOriginal = new Map<string, number>();
  for (const row of rows) {
    if (row.paymentType !== "refund" || row.status !== "refunded" || !row.originalPaymentId) {
      continue;
    }
    refundsByOriginal.set(
      row.originalPaymentId,
      (refundsByOriginal.get(row.originalPaymentId) ?? 0) + Math.abs(row.amountCents),
    );
  }
  return rows.flatMap((row) => {
    if ((row.paymentType ?? "charge") !== "charge" || row.status !== "confirmed") {
      return [];
    }
    const chargeId = row.id ?? row.paymentId;
    const amountCents = Math.max(
      0,
      Math.abs(row.amountCents) - (chargeId ? (refundsByOriginal.get(chargeId) ?? 0) : 0),
    );
    return amountCents > 0 ? [{ payment: row, amountCents }] : [];
  });
}

export function summarizeNetChargeAllocations<T extends PaymentLedgerRow>(rows: T[]) {
  const allocations = netChargeAllocations(rows);
  return {
    allocations,
    totalCents: allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0),
  };
}

export function paymentLedgerDeltaSql() {
  return sql<number>`case
    when ${payments.paymentType} = 'refund'
      and ${payments.status} = 'refunded'
      and ${payments.originalPaymentId} is not null
      then -abs(${payments.amountCents})
    when ${payments.paymentType} = 'charge'
      and ${payments.status} = 'confirmed'
      then abs(${payments.amountCents})
    else 0
  end`;
}

export function netPaymentSumSql() {
  return sql<number>`coalesce(sum(${paymentLedgerDeltaSql()}), 0)::int`;
}
