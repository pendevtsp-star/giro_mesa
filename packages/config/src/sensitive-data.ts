const sensitiveKeys = new Set([
  "authorization",
  "api_key",
  "apikey",
  "secret",
  "token",
  "password",
  "cookie",
  "set_cookie",
  "pan",
  "cvv",
  "pin",
  "email",
  "phone",
  "cpf",
  "cnpj",
]);
const safeKeys = new Set(["correlation_id", "correlationid", "request_id", "requestid", "code"]);
const textPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:re|sk|pk)_[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
];

export function sanitizeSensitiveData<T>(value: T): T {
  return sanitize(value, new WeakMap()) as T;
}

export function auditMetadata<T extends Record<string, unknown>>(metadata: T): T {
  return sanitizeSensitiveData(metadata);
}

export function sanitizeErrorMessage(error: unknown): string {
  return redactText(error instanceof Error ? error.message : String(error));
}

export function createSanitizedLogger(scope: string) {
  const write = (
    level: "log" | "warn" | "error" | "debug",
    message: unknown,
    context?: unknown,
  ) => {
    const sanitizedMessage = sanitizeSensitiveData(message);
    const sanitizedContext = context === undefined ? undefined : sanitizeSensitiveData(context);
    if (sanitizedContext === undefined) console[level](`[${scope}]`, sanitizedMessage);
    else console[level](`[${scope}]`, sanitizedMessage, sanitizedContext);
  };
  return {
    info: (message: unknown, context?: unknown) => write("log", message, context),
    warn: (message: unknown, context?: unknown) => write("warn", message, context),
    error: (message: unknown, context?: unknown) => write("error", message, context),
    debug: (message: unknown, context?: unknown) => write("debug", message, context),
  };
}

function sanitize(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redactText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (value instanceof Date) return new Date(value);
  if (value instanceof Error) {
    const copy = new Error(redactText(value.message));
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
    seen.set(value, copy);
    if (value.cause !== undefined) copy.cause = sanitize(value.cause, seen);
    copy.name = value.name;
    if (value.stack) copy.stack = redactText(value.stack);
    for (const [key, entry] of Object.entries(value)) {
      Object.assign(copy, { [key]: isSensitiveKey(key) ? "[REDACTED]" : sanitize(entry, seen) });
    }
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, entry] of value) copy.set(key, sanitize(entry, seen));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const entry of value) copy.add(sanitize(entry, seen));
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const entry of value) copy.push(sanitize(entry, seen));
    return copy;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitize(entry, seen);
  }
  return copy;
}

function isSensitiveKey(key: string) {
  const normalized = key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  if (safeKeys.has(normalized)) return false;
  return (
    normalized.split("_").some((part) => sensitiveKeys.has(part)) || sensitiveKeys.has(normalized)
  );
}

function redactText(value: string) {
  return textPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
}
