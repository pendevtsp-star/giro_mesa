import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export class UnsafeOutboundUrlError extends Error {
  readonly code = "UNSAFE_OUTBOUND_URL";
}

export type SafeHttpAddress = { address: string; family: 4 | 6 };
export type SafeHttpResolver = (hostname: string) => Promise<SafeHttpAddress[]>;
export type SafeHttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array | URLSearchParams;
  signal?: AbortSignal;
  maxRedirects?: number;
};
export type PinnedHttpRequest = {
  url: URL;
  address: SafeHttpAddress;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  signal?: AbortSignal;
};
export type SafeHttpTransportResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
};
export type SafeHttpTransport = (request: PinnedHttpRequest) => Promise<SafeHttpTransportResponse>;

export class SafeHttpResponse {
  readonly ok: boolean;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly headers: Record<string, string>,
    private readonly body: Buffer,
  ) {
    this.ok = status >= 200 && status < 300;
  }

  async text() {
    return this.body.toString("utf8");
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

export class SafeHttpClient {
  constructor(
    private readonly resolver: SafeHttpResolver = resolveDns,
    private readonly transport: SafeHttpTransport = pinnedHttpsTransport,
  ) {}

  async fetch(value: string | URL, init: SafeHttpRequestInit = {}) {
    let url = validateOutboundUrl(value);
    let method = (init.method ?? "GET").toUpperCase();
    let body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
    let headers = { ...(init.headers ?? {}) };
    const maxRedirects = init.maxRedirects ?? 3;

    for (let redirectCount = 0; ; redirectCount += 1) {
      const addresses = await resolveValidatedAddresses(url, this.resolver);
      const pinnedAddress = addresses[0];
      if (!pinnedAddress) throw new UnsafeOutboundUrlError("Outbound hostname has no address");
      const response = await this.transport({
        url,
        address: pinnedAddress,
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      });
      const location = response.headers.location;
      if (!isRedirect(response.status) || !location) {
        return new SafeHttpResponse(
          response.status,
          response.statusText,
          response.headers,
          response.body,
        );
      }
      if (redirectCount >= maxRedirects) {
        throw new UnsafeOutboundUrlError("Outbound redirect limit exceeded");
      }
      const nextUrl = validateOutboundUrl(new URL(location, url));
      if (nextUrl.origin !== url.origin) headers = stripSensitiveHeaders(headers);
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
        headers = stripBodyHeaders(headers);
      }
      url = nextUrl;
    }
  }
}

const sharedSafeHttpClient = new SafeHttpClient();

export function safeFetch(value: string | URL, init?: SafeHttpRequestInit) {
  return sharedSafeHttpClient.fetch(value, init);
}

export function validateOutboundUrl(value: string | URL) {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new UnsafeOutboundUrlError("Outbound URL must use HTTPS without credentials");
  }
  return url;
}

export async function resolveValidatedAddresses(url: URL, resolver: SafeHttpResolver = resolveDns) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some((record) => isPrivateAddress(record.address))) {
    throw new UnsafeOutboundUrlError("Outbound URL resolves to a private address");
  }
  return addresses;
}

async function resolveDns(hostname: string): Promise<SafeHttpAddress[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.flatMap((record) => {
    const family = isIP(record.address);
    return family === 4 || family === 6
      ? [{ address: record.address, family } satisfies SafeHttpAddress]
      : [];
  });
}

async function pinnedHttpsTransport(request: PinnedHttpRequest) {
  return new Promise<SafeHttpTransportResponse>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: request.url.hostname,
        port: request.url.port || 443,
        path: `${request.url.pathname}${request.url.search}`,
        method: request.method,
        headers: request.headers,
        servername: request.url.hostname,
        lookup: (_hostname, _options, callback) => {
          callback(null, request.address.address, request.address.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;
          if (bytes > 2 * 1024 * 1024) {
            req.destroy(new Error("Outbound response exceeds 2 MB"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? "",
            headers: normalizeResponseHeaders(response.headers),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    if (request.signal) {
      const abort = () => req.destroy(new DOMException("The operation was aborted", "AbortError"));
      if (request.signal.aborted) abort();
      else request.signal.addEventListener("abort", abort, { once: true });
    }
    if (request.body !== undefined) req.write(request.body);
    req.end();
  });
}

function normalizeResponseHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [[key.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]];
    }),
  );
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function stripSensitiveHeaders(headers: Record<string, string>) {
  const blocked = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
    "access_token",
    "x-giromesa-signature",
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !blocked.has(normalized) && !normalized.startsWith("x-giromesa-");
    }),
  );
}

function stripBodyHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) => key.toLowerCase() !== "content-type" && key.toLowerCase() !== "content-length",
    ),
  );
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (
    normalized === "::1" ||
    normalized === "::" ||
    /^fe[89ab][0-9a-f]:/.test(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  )
    return true;
  const mappedDotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const mapped =
    mappedDotted ??
    (mappedHex?.[1] && mappedHex[2] ? mappedHexToIpv4(mappedHex[1], mappedHex[2]) : null);
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [first = 0, second = 0] = ipv4.split(".").map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function mappedHexToIpv4(high: string, low: string) {
  const highValue = Number.parseInt(high, 16);
  const lowValue = Number.parseInt(low, 16);
  return `${highValue >> 8}.${highValue & 255}.${lowValue >> 8}.${lowValue & 255}`;
}
