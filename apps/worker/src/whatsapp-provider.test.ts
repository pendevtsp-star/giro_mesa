import { afterEach, describe, expect, it } from "vitest";
import { createWhatsAppProvider, DisabledWhatsAppProvider } from "./whatsapp-provider";

const originalTransport = process.env.WHATSAPP_TRANSPORT;

afterEach(() => {
  if (originalTransport === undefined) delete process.env.WHATSAPP_TRANSPORT;
  else process.env.WHATSAPP_TRANSPORT = originalTransport;
});

describe("worker WhatsApp transport policy", () => {
  it("does not report delivery when QR transport is not installed", async () => {
    process.env.WHATSAPP_TRANSPORT = "qr_unofficial";
    const provider = createWhatsAppProvider();
    expect(provider).toBeInstanceOf(DisabledWhatsAppProvider);
    await expect(
      provider.send({ type: "text", to: "+5511999999999", text: "teste" }),
    ).resolves.toMatchObject({ status: "disabled", provider: "disabled" });
  });
});
