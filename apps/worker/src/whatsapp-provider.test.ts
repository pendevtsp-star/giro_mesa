import { afterEach, describe, expect, it } from "vitest";
import {
  createWhatsAppProvider,
  DisabledWhatsAppProvider,
  WhatsappQrConnectorProvider,
} from "./whatsapp-provider";

const originalTransport = process.env.WHATSAPP_TRANSPORT;
const originalConnectorUrl = process.env.WHATSAPP_QR_CONNECTOR_URL;
const originalConnectorKey = process.env.WHATSAPP_QR_CONNECTOR_KEY;

afterEach(() => {
  if (originalTransport === undefined) delete process.env.WHATSAPP_TRANSPORT;
  else process.env.WHATSAPP_TRANSPORT = originalTransport;
  if (originalConnectorUrl === undefined) delete process.env.WHATSAPP_QR_CONNECTOR_URL;
  else process.env.WHATSAPP_QR_CONNECTOR_URL = originalConnectorUrl;
  if (originalConnectorKey === undefined) delete process.env.WHATSAPP_QR_CONNECTOR_KEY;
  else process.env.WHATSAPP_QR_CONNECTOR_KEY = originalConnectorKey;
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

  it("selects QR only with an explicit endpoint and key", () => {
    process.env.WHATSAPP_TRANSPORT = "qr_unofficial";
    process.env.WHATSAPP_QR_CONNECTOR_URL = "http://localhost:3338";
    process.env.WHATSAPP_QR_CONNECTOR_KEY = "connector-key";
    expect(createWhatsAppProvider()).toBeInstanceOf(WhatsappQrConnectorProvider);
  });
});
