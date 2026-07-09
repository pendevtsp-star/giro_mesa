import { describe, expect, it } from "vitest";
import {
  accentPresetToHex,
  buildDocumentInitial,
  renderBrandedEmail,
  renderBrandedPrintDocument,
} from "./document-branding";

describe("document branding", () => {
  it("renders branded email with tenant identity", () => {
    const html = renderBrandedEmail({
      branding: {
        displayName: "Bar Aurora",
        logoUrl: null,
        accentPreset: "blue",
      },
      title: "Convite enviado",
      body: "Ative seu acesso para continuar.",
      actionLabel: "Abrir convite",
      actionUrl: "https://example.test/invite",
    });

    expect(html).toContain("Bar Aurora");
    expect(html).toContain("Convite enviado");
    expect(html).toContain("https://example.test/invite");
    expect(html).toContain(accentPresetToHex("blue"));
  });

  it("renders printable document shell with metadata and metrics", () => {
    const html = renderBrandedPrintDocument({
      branding: {
        displayName: "Bar Aurora",
        logoUrl: null,
        accentPreset: "emerald",
      },
      documentLabel: "Relatorio",
      title: "Fechamento por caixa",
      subtitle: "Resumo executivo",
      metadata: [{ label: "Periodo", value: "Hoje" }],
      metrics: [{ label: "Caixas fechados", value: "3" }],
      bodyHtml: "<section class='section'><h2>Resumo</h2></section>",
    });

    expect(html).toContain("Fechamento por caixa");
    expect(html).toContain("Caixas fechados");
    expect(html).toContain("Resumo executivo");
    expect(html).toContain("Documento padronizado");
  });

  it("builds a stable initial for document avatars", () => {
    expect(buildDocumentInitial("GiroMesa")).toBe("G");
    expect(buildDocumentInitial(" bar ")).toBe("B");
  });
});
