import { describe, expect, it } from "vitest";
import type { LegalAcceptanceStatus } from "../../lib/giromesa-api";
import { canConfirmLegalAcceptance, missingLegalDocuments } from "./acceptance-policy";

const status: LegalAcceptanceStatus = {
  required: true,
  complete: false,
  configurationComplete: true,
  documents: [
    { documentType: "terms", published: true, version: "v2", accepted: false },
    { documentType: "privacy", published: true, version: "v3", accepted: false },
  ],
};

describe("legal acceptance policy", () => {
  it("does not allow recording evidence before every explicit confirmation", () => {
    expect(canConfirmLegalAcceptance(status, { terms: false, privacy: false })).toBe(false);
    expect(canConfirmLegalAcceptance(status, { terms: true, privacy: false })).toBe(false);
    expect(canConfirmLegalAcceptance(status, { terms: true, privacy: true })).toBe(true);
  });

  it("requests only documents from the current version that are still missing", () => {
    const partiallyAccepted = {
      ...status,
      documents: status.documents.map((document) =>
        document.documentType === "terms" ? { ...document, accepted: true } : document,
      ),
    };

    expect(
      missingLegalDocuments(partiallyAccepted).map((document) => document.documentType),
    ).toEqual(["privacy"]);
  });
});
