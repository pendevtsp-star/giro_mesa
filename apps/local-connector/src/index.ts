import { Socket } from "node:net";
import { hostname } from "node:os";

type PrintJob = {
  id: string;
  printerName: string | null;
  printerAddress?: string | null;
  printerPort?: number | null;
  printerConfig?: Record<string, unknown> | null;
  status: string;
  renderedText: string;
  copies: number;
  payload: Record<string, unknown>;
};

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3333";
const branchId = process.env.GIROMESA_BRANCH_ID;
const connectorToken = process.env.GIROMESA_CONNECTOR_TOKEN;
const dryRun = process.env.CONNECTOR_DRY_RUN !== "false";
const pollMs = Number(process.env.CONNECTOR_POLL_MS ?? "2500");
const defaultPrinterHost = process.env.CONNECTOR_PRINTER_HOST;
const defaultPrinterPort = Number(process.env.CONNECTOR_PRINTER_PORT ?? "9100");
const connectorVersion = "0.1.0";

if (!connectorToken) {
  console.error("GIROMESA_CONNECTOR_TOKEN is required to poll protected print jobs.");
  process.exit(1);
}

console.log(
  JSON.stringify({
    event: "local_connector_started",
    apiUrl,
    branchId: branchId ?? "all",
    dryRun,
    pollMs,
  }),
);

setInterval(() => {
  void processPendingJobs().catch((error) => {
    console.error(
      JSON.stringify({
        event: "local_connector_poll_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  });
}, pollMs);

setInterval(
  () => {
    void sendHeartbeat().catch((error) => {
      console.error(
        JSON.stringify({
          event: "local_connector_heartbeat_failed",
          error: error instanceof Error ? error.message : "unknown_error",
        }),
      );
    });
  },
  Math.max(10_000, pollMs * 2),
);

void sendHeartbeat();
void processPendingJobs();

async function sendHeartbeat() {
  await apiRequest("/api/v1/printing/connectors/heartbeat", {
    method: "POST",
    body: {
      version: connectorVersion,
      hostname: hostname(),
      platform: process.platform,
      dryRun,
      printerCount: defaultPrinterHost ? 1 : 0,
    },
  });
}

async function processPendingJobs() {
  const query = new URLSearchParams({ status: "pending" });
  if (branchId) {
    query.set("branchId", branchId);
  }

  const response = await apiRequest<{ data: PrintJob[] }>(`/api/v1/printing/jobs?${query}`);
  for (const job of response.data.slice(0, 5)) {
    await processJob(job);
  }
}

async function processJob(job: PrintJob) {
  await apiRequest(`/api/v1/printing/jobs/${job.id}/start`, { method: "POST" });

  try {
    for (let copy = 0; copy < job.copies; copy += 1) {
      await printJob(job);
    }
    await apiRequest(`/api/v1/printing/jobs/${job.id}/complete`, { method: "POST" });
  } catch (error) {
    await apiRequest(`/api/v1/printing/jobs/${job.id}/fail`, {
      method: "POST",
      body: {
        errorMessage: error instanceof Error ? error.message : "print_failed",
      },
    });
  }
}

async function printJob(job: PrintJob) {
  if (dryRun) {
    console.log(
      JSON.stringify({
        event: "dry_run_print",
        jobId: job.id,
        printerName: job.printerName,
        preview: job.renderedText.slice(0, 180),
      }),
    );
    return;
  }

  const printerConfig = readObject(job.payload.printerConfig) ?? job.printerConfig ?? {};
  const host = readString(job.payload.printerHost) ?? job.printerAddress ?? defaultPrinterHost;
  const port = Number(readString(job.payload.printerPort) ?? job.printerPort ?? defaultPrinterPort);
  if (!host) {
    throw new Error("Printer host is required for network printing");
  }

  await writeEscPosTcp(host, port, job.renderedText, printerConfig);
}

function writeEscPosTcp(host: string, port: number, text: string, config: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("printer_connection_timeout"));
    }, 5000);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.connect(port, host, () => {
      const payload = buildEscPosPayload(text, config);
      socket.end(payload, () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  });
}

function buildEscPosPayload(text: string, config: Record<string, unknown>) {
  const codepage = readString(config.codepage) ?? "cp850";
  const cutMode = readString(config.cutMode) ?? "partial";
  const boldHeader = readBoolean(config.boldHeader) ?? true;
  const beep = readBoolean(config.beep) ?? false;
  const openDrawer = readBoolean(config.openDrawer) ?? false;

  const chunks: Buffer[] = [Buffer.from([0x1b, 0x40]), codepageCommand(codepage)];

  if (openDrawer) {
    chunks.push(Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x64]));
  }

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const isHeader = boldHeader && index < 2 && line.trim().length > 0;
    if (isHeader) {
      chunks.push(Buffer.from([0x1b, 0x45, 0x01]));
    }
    chunks.push(encodeEscPosText(`${line}\n`, codepage));
    if (isHeader) {
      chunks.push(Buffer.from([0x1b, 0x45, 0x00]));
    }
  });

  if (beep) {
    chunks.push(Buffer.from([0x07]));
  }

  chunks.push(Buffer.from("\n\n", "ascii"));
  chunks.push(cutCommand(cutMode));
  return Buffer.concat(chunks);
}

function codepageCommand(codepage: string) {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp860") {
    return Buffer.from([0x1b, 0x74, 0x03]);
  }
  if (normalized === "windows1252" || normalized === "cp1252") {
    return Buffer.from([0x1b, 0x74, 0x10]);
  }
  return Buffer.from([0x1b, 0x74, 0x02]);
}

function cutCommand(cutMode: string) {
  return cutMode === "full" ? Buffer.from([0x1d, 0x56, 0x00]) : Buffer.from([0x1d, 0x56, 0x01]);
}

function encodeEscPosText(text: string, codepage: string) {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp850" || normalized === "cp860") {
    return Buffer.from([...text].map((char) => cp850Byte(char)));
  }
  return Buffer.from(text, "latin1");
}

function cp850Byte(char: string) {
  const code = char.charCodeAt(0);
  if (code <= 0x7f) {
    return code;
  }

  const map: Record<string, number> = {
    ç: 0x87,
    Ç: 0x80,
    á: 0xa0,
    à: 0x85,
    ã: 0xc6,
    â: 0x83,
    Á: 0xb5,
    À: 0xb7,
    Ã: 0xc7,
    Â: 0xb6,
    é: 0x82,
    ê: 0x88,
    É: 0x90,
    Ê: 0xd2,
    í: 0xa1,
    Í: 0xd6,
    ó: 0xa2,
    õ: 0xe4,
    ô: 0x93,
    Ó: 0xe0,
    Õ: 0xe5,
    Ô: 0xe2,
    ú: 0xa3,
    Ú: 0xe9,
    ü: 0x81,
    Ü: 0x9a,
    º: 0xa7,
  };

  return map[char] ?? "?".charCodeAt(0);
}

async function apiRequest<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      "x-giromesa-connector-key": connectorToken ?? "",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  };
  if (options.body) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiUrl}${path}`, requestInit);

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(readError(payload, response.status));
  }
  return payload as T;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readError(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "message" in payload) {
    return String((payload as { message: unknown }).message);
  }
  return `API request failed with status ${status}`;
}
