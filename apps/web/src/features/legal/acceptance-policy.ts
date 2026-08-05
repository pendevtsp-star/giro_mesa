import type { LegalAcceptanceStatus } from "../../lib/giromesa-api";

export function missingLegalDocuments(status: LegalAcceptanceStatus) {
  return status.documents.filter((document) => document.published && !document.accepted);
}

export function canConfirmLegalAcceptance(
  status: LegalAcceptanceStatus,
  confirmations: Record<"terms" | "privacy", boolean>,
) {
  const missing = missingLegalDocuments(status);
  return (
    status.required &&
    status.configurationComplete &&
    missing.length > 0 &&
    missing.every((document) => confirmations[document.documentType])
  );
}
