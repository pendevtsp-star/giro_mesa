import { describe, expect, it } from "vitest";
import {
  getPublicQrCopy,
  normalizePublicQrLanguage,
  publicOrderStatusLabel,
  publicTimelineLabel,
} from "./public-copy";

describe("public QR translations", () => {
  it.each([
    ["pt-BR", "Enviar pedido"],
    ["en", "Send order"],
    ["es", "Enviar pedido"],
  ])("renders the public journey in %s", (language, expected) => {
    expect(getPublicQrCopy(language).sendOrder).toBe(expected);
  });

  it("falls back to Brazilian Portuguese for unsupported language values", () => {
    expect(normalizePublicQrLanguage("fr")).toBe("pt-BR");
    expect(getPublicQrCopy("fr").callWaiter).toBe("Chamar garçom");
  });

  it("translates dynamic order and timeline states", () => {
    expect(publicOrderStatusLabel("preparing", "en")).toBe("Preparing");
    expect(publicTimelineLabel("ready", "Pronto", "es")).toBe("Listo");
  });
});
