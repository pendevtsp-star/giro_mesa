import { Socket } from "node:net";

export type TcpPrintConfig = {
  host: string;
  port: number;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

export async function testTcpConnection(
  config: TcpPrintConfig,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, error: "connection_timeout" });
    }, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ ok: false, error: error.message });
    });

    socket.connect(config.port, config.host, () => {
      clearTimeout(timeout);
      socket.end(() => {
        resolve({ ok: true });
      });
    });
  });
}

export async function sendEscPosTcp(
  config: TcpPrintConfig,
  renderedText: string,
  printerConfig: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, error: "printer_connection_timeout" });
    }, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ ok: false, error: error.message });
    });

    socket.connect(config.port, config.host, () => {
      const payload = buildEscPosPayload(renderedText, printerConfig);
      socket.end(payload, () => {
        clearTimeout(timeout);
        resolve({ ok: true });
      });
    });
  });
}

function buildEscPosPayload(text: string, config: Record<string, unknown>): Buffer {
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

function codepageCommand(codepage: string): Buffer {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp860") {
    return Buffer.from([0x1b, 0x74, 0x03]);
  }
  if (normalized === "windows1252" || normalized === "cp1252") {
    return Buffer.from([0x1b, 0x74, 0x10]);
  }
  return Buffer.from([0x1b, 0x74, 0x02]);
}

function cutCommand(cutMode: string): Buffer {
  return cutMode === "full" ? Buffer.from([0x1d, 0x56, 0x00]) : Buffer.from([0x1d, 0x56, 0x01]);
}

function encodeEscPosText(text: string, codepage: string): Buffer {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp850" || normalized === "cp860") {
    return Buffer.from([...text].map((char) => cp850Byte(char)));
  }
  return Buffer.from(text, "latin1");
}

function cp850Byte(char: string): number {
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
