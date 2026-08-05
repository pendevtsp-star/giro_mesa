import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalLegalDocumentText, publicLegalDocuments } from "./public-documents";

describe("public legal document source", () => {
  it.each(["terms", "privacy"] as const)("keeps the %s draft hash reproducible", (type) => {
    const document = publicLegalDocuments[type];
    const digest = createHash("sha256").update(canonicalLegalDocumentText(document)).digest("hex");

    expect(document.status).toBe("draft");
    expect(document.version).toMatch(/^draft-\d{4}-\d{2}-\d{2}$/);
    expect(digest).toBe(document.hash);
  });
});
