import { afterEach, describe, expect, it } from "vitest";
import {
  createWhatsAppProvider,
  MockWhatsAppProvider,
  WhatsAppCloudProvider,
} from "./whatsapp-provider";

const originalTransport = process.env.WHATSAPP_TRANSPORT;
const originalPhoneId = process.env.META_PHONE_NUMBER_ID;
const originalAccessToken = process.env.META_ACCESS_TOKEN;

afterEach(() => {
  if (originalTransport === undefined) delete process.env.WHATSAPP_TRANSPORT;
  else process.env.WHATSAPP_TRANSPORT = originalTransport;
  if (originalPhoneId === undefined) delete process.env.META_PHONE_NUMBER_ID;
  else process.env.META_PHONE_NUMBER_ID = originalPhoneId;
  if (originalAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
  else process.env.META_ACCESS_TOKEN = originalAccessToken;
});

describe("WhatsApp transport policy", () => {
  it("keeps legacy Meta credentials disabled unless transport is explicit", () => {
    delete process.env.WHATSAPP_TRANSPORT;
    process.env.META_PHONE_NUMBER_ID = "123456";
    process.env.META_ACCESS_TOKEN = "token";

    expect(createWhatsAppProvider()).toBeInstanceOf(MockWhatsAppProvider);
  });

  it("allows the legacy provider only for an explicit migration setting", () => {
    process.env.WHATSAPP_TRANSPORT = "meta_legacy";
    process.env.META_PHONE_NUMBER_ID = "123456";
    process.env.META_ACCESS_TOKEN = "token";

    expect(createWhatsAppProvider()).toBeInstanceOf(WhatsAppCloudProvider);
  });
});
