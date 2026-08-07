import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { z } from "zod";
import { GiroMesaClient } from "./api-client.js";
import { connectionFromUpdate, isLoggedOut, normalizeQr } from "./session.js";

const apiUrl = required("GIROMESA_API_URL").replace(/\/$/, "");
const connectorKey = required("GIROMESA_CONNECTOR_KEY");
const sessionDir = resolve(process.env.WHATSAPP_SESSION_DIR ?? ".data/whatsapp");
const version = process.env.WHATSAPP_CONNECTOR_VERSION ?? "0.1.0";
const client = new GiroMesaClient(apiUrl, connectorKey);
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });
const messageSchema = z.object({
  type: z.literal("text"),
  to: z.string().min(3).max(80),
  text: z.string().min(1).max(4096),
});
let socket: ReturnType<typeof makeWASocket> | undefined;
const recentMessages = new Map<string, { messageId: string; at: number }>();
const sendTimestamps: number[] = [];

await mkdir(sessionDir, { recursive: true });
const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

let restarting = false;
async function connect() {
  const currentSocket = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("GiroMesa QR Connector"),
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });
  socket = currentSocket;

  currentSocket.ev.on("creds.update", saveCreds);
  currentSocket.ev.on("connection.update", async (update) => {
    const status = connectionFromUpdate(update);
    const qr = normalizeQr(update.qr);
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log("WhatsApp QR exibido. Esta conexão não é oficial da Meta.");
    }

    const phone = currentSocket.user?.id?.split(":")[0];
    try {
      await client.heartbeat({
        version,
        status,
        ...(qr ? { qr } : {}),
        ...(phone ? { phone } : {}),
      });
    } catch (error) {
      logger.warn({ error }, "heartbeat do conector não enviado");
    }

    if (update.connection === "close" && !restarting) {
      restarting = true;
      const loggedOut = isLoggedOut(update.lastDisconnect?.error);
      if (
        !loggedOut &&
        (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode !== DisconnectReason.loggedOut
      ) {
        setTimeout(() => {
          restarting = false;
          void connect();
        }, 3_000);
      }
    }
  });
}

await connect();

const port = Number(process.env.WHATSAPP_CONNECTOR_PORT ?? 3338);
createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, unofficial: true }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/messages") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers["x-giromesa-connector-key"] !== connectorKey || !socket?.user) {
    response.writeHead(401).end();
    return;
  }
  const idempotencyKey = request.headers["x-idempotency-key"];
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 160
  ) {
    response.writeHead(400).end(JSON.stringify({ error: "x-idempotency-key obrigatório" }));
    return;
  }
  const previous = recentMessages.get(idempotencyKey);
  if (previous) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ messageId: previous.messageId, status: "sent", duplicate: true }),
    );
    return;
  }
  const now = Date.now();
  while (sendTimestamps[0] !== undefined && now - sendTimestamps[0] > 60_000)
    sendTimestamps.shift();
  if (sendTimestamps.length >= 60) {
    response.writeHead(429).end(JSON.stringify({ error: "limite de envio atingido" }));
    return;
  }
  try {
    const body = await readJson(request);
    const message = messageSchema.parse(body);
    const jid = message.to.includes("@")
      ? message.to
      : `${message.to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await socket.sendMessage(jid, { text: message.text });
    const messageId = result?.key?.id ?? `qr-${Date.now()}`;
    sendTimestamps.push(now);
    recentMessages.set(idempotencyKey, { messageId, at: now });
    if (recentMessages.size > 10_000)
      recentMessages.delete(recentMessages.keys().next().value as string);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ messageId, status: "sent" }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "invalid_message" }),
    );
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`WhatsApp QR connector listening on 127.0.0.1:${port}`),
);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
}
