export type ResendDeliveryEvent = {
  id: string;
  type: "email.delivered" | "email.bounced" | "email.complained" | "email.suppressed";
  recipient: string | null;
  status: "processed" | "suppressed";
  shouldSuppressRecipient: boolean;
};

const supportedTypes = new Set<ResendDeliveryEvent["type"]>([
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);

export function normalizeResendDeliveryEvent(
  payload: Record<string, unknown>,
): ResendDeliveryEvent | null {
  const id = typeof payload.id === "string" ? payload.id : null;
  const type = typeof payload.type === "string" ? payload.type : null;
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : {};
  const recipient =
    typeof data.to === "string" ? data.to : typeof payload.to === "string" ? payload.to : null;
  if (!id || !type || !supportedTypes.has(type as ResendDeliveryEvent["type"])) {
    return null;
  }
  const shouldSuppressRecipient =
    type === "email.bounced" || type === "email.complained" || type === "email.suppressed";
  if (shouldSuppressRecipient && !recipient) return null;
  return {
    id,
    type: type as ResendDeliveryEvent["type"],
    recipient,
    status: shouldSuppressRecipient ? "suppressed" : "processed",
    shouldSuppressRecipient,
  };
}
