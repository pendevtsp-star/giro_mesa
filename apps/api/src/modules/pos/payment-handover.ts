import type { CashHandoverStatus, PaymentMethod } from "@giromesa/domain";

export function resolveCashHandoverStatus(
  method: PaymentMethod,
  registeredVia: "waiter" | "cashier",
): CashHandoverStatus {
  if (method !== "cash") return "not_required";
  return registeredVia === "waiter" ? "pending" : "received";
}
