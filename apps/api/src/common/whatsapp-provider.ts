const META_GRAPH_API_VERSION = "v21.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
};

type TextMessage = {
  type: "text";
  to: string;
  text: string;
};

type TemplateParam = {
  type: "text" | "currency" | "date_time" | "image" | "video" | "document";
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { link: string };
  video?: { link: string };
  document?: { link: string };
};

type TemplateMessage = {
  type: "template";
  to: string;
  templateName: string;
  languageCode: string;
  params?: TemplateParam[];
};

type MediaMessage = {
  type: "media";
  to: string;
  mediaType: "image" | "video" | "document" | "audio";
  mediaUrl: string;
  caption?: string;
  filename?: string;
};

export type WhatsAppMessage = TextMessage | TemplateMessage | MediaMessage;

export type WhatsAppDelivery = {
  provider: "whatsapp_cloud";
  messageId: string;
  status: "sent" | "queued";
  to: string;
};

export type IncomingMessage = {
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  text?: string;
  templateName?: string;
  buttonPayload?: string;
  rawPayload: Record<string, unknown>;
};

export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppDelivery>;
  verifyWebhubChallenge(mode: string, token: string, challenge: string): string | null;
  parseIncomingPayload(payload: Record<string, unknown>): IncomingMessage[];
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async send(message: WhatsAppMessage): Promise<WhatsAppDelivery> {
    return {
      provider: "whatsapp_cloud",
      messageId: `mock-wa:${message.to}:${Date.now()}`,
      status: "queued",
      to: message.to,
    };
  }

  verifyWebhubChallenge(mode: string, token: string, challenge: string): string | null {
    return null;
  }

  parseIncomingPayload(_payload: Record<string, unknown>): IncomingMessage[] {
    return [];
  }
}

const SEND_RETRY_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 1000;

export class WhatsAppCloudProvider implements WhatsAppProvider {
  private readonly config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppDelivery> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt++) {
      try {
        const body = this.buildRequestBody(message);
        const response = await fetch(
          `${META_GRAPH_API_BASE}/${this.config.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.config.accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          const error = new Error(`WhatsApp API error ${response.status}: ${errorBody}`);
          if (!this.isTransientError(response.status)) {
            throw error;
          }
          lastError = error;
          if (attempt < SEND_RETRY_ATTEMPTS) {
            await sleep(SEND_RETRY_DELAY_MS * attempt);
          }
          continue;
        }

        const result = (await response.json()) as {
          messages?: Array<{ id: string }>;
        };
        const messageId = result.messages?.[0]?.id;

        return {
          provider: "whatsapp_cloud",
          messageId: messageId ?? `meta-${Date.now()}`,
          status: "sent",
          to: message.to,
        };
      } catch (error) {
        lastError = error;
        if (attempt < SEND_RETRY_ATTEMPTS) {
          await sleep(SEND_RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw new Error(
      `WhatsApp delivery failed after ${SEND_RETRY_ATTEMPTS} attempts: ${formatError(lastError)}`,
    );
  }

  verifyWebhubChallenge(mode: string, token: string, challenge: string): string | null {
    if (mode === "subscribe" && token === this.config.accessToken) {
      return challenge;
    }
    return null;
  }

  parseIncomingPayload(payload: Record<string, unknown>): IncomingMessage[] {
    const messages: IncomingMessage[] = [];
    const entries = payload.entry;
    if (!Array.isArray(entries)) {
      return messages;
    }

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) {
        continue;
      }

      for (const change of changes) {
        const value = change?.value as Record<string, unknown> | undefined;
        if (!value) {
          continue;
        }

        const incomingMessages = value.messages;
        if (!Array.isArray(incomingMessages)) {
          continue;
        }

        for (const msg of incomingMessages) {
          if (!msg || typeof msg !== "object") {
            continue;
          }

          const m = msg as Record<string, unknown>;
          const parsed: IncomingMessage = {
            from: String(m.from ?? ""),
            messageId: String(m.id ?? ""),
            timestamp: String(m.timestamp ?? ""),
            type: String(m.type ?? ""),
            rawPayload: m,
          };

          if (m.type === "text" && m.text && typeof m.text === "object") {
            parsed.text = String((m.text as Record<string, unknown>).body ?? "");
          }

          if (m.type === "button" && m.button && typeof m.button === "object") {
            const btn = m.button as Record<string, unknown>;
            parsed.buttonPayload = String(btn.payload ?? "");
            parsed.text = String(btn.text ?? "");
          }

          messages.push(parsed);
        }
      }
    }

    return messages;
  }

  private buildRequestBody(message: WhatsAppMessage) {
    const recipient = { to: message.to };

    switch (message.type) {
      case "text":
        return {
          messaging_product: "whatsapp",
          ...recipient,
          type: "text",
          text: { body: message.text },
        };
      case "template":
        return {
          messaging_product: "whatsapp",
          ...recipient,
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.languageCode },
            ...(message.params && message.params.length > 0
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: message.params.map((p) => {
                        const param: Record<string, unknown> = { type: p.type };
                        if (p.type === "text") param.text = p.text;
                        if (p.type === "currency") param.currency = p.currency;
                        if (p.type === "date_time") param.date_time = p.date_time;
                        if (p.type === "image") param.image = p.image;
                        if (p.type === "video") param.video = p.video;
                        if (p.type === "document") param.document = p.document;
                        return param;
                      }),
                    },
                  ],
                }
              : {}),
          },
        };
      case "media": {
        const mediaObj: Record<string, string> = { link: message.mediaUrl };
        if (message.caption) mediaObj.caption = message.caption;
        if (message.filename) mediaObj.filename = message.filename;

        return {
          messaging_product: "whatsapp",
          ...recipient,
          type: message.mediaType,
          [message.mediaType]: mediaObj,
        };
      }
    }
  }

  private isTransientError(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }
}

export function createWhatsAppProvider(): WhatsAppProvider {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (phoneNumberId && accessToken && !isPlaceholderValue(phoneNumberId)) {
    const wabaId = process.env.META_WABA_ID;
    return new WhatsAppCloudProvider({
      phoneNumberId,
      accessToken,
      ...(wabaId ? { wabaId } : {}),
    });
  }

  return new MockWhatsAppProvider();
}

function isPlaceholderValue(value: string | undefined) {
  return !value || value.startsWith("replace-with-");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
