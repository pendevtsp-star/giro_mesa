export type OperationalOutboxStatus = "pending" | "confirmed" | "failed" | "requires_attention";

export type OperationalOutboxScope = {
  tenantId: string;
  branchId: string;
};

export type OperationReceipt = {
  operationId: string;
  version?: number;
  confirmedAt: string;
};

export type OperationalOutboxEntry = {
  idempotencyKey: string;
  operation: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  payload: Record<string, unknown>;
  replayable?: boolean;
  status: OperationalOutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  receipt?: OperationReceipt;
  error?: string;
};

export type OperationalOutboxOptions = {
  maxActiveEntries?: number;
};

export type OperationalCommandResult = Record<string, unknown>;
export type OperationalCommandSender<
  T extends OperationalCommandResult = OperationalCommandResult,
> = (entry: OperationalOutboxEntry) => Promise<T>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "giromesa:operational-outbox:v1";
export const OPERATIONAL_OUTBOX_CHANGED = "giromesa:operational-outbox-changed";
const MAX_ACTIVE_ENTRIES = 100;
const CONFIRMED_RETENTION_MS = 24 * 60 * 60 * 1000;
const sensitiveKey = /(?:authorization|cookie|password|secret|token|cvv|cardnumber|pan)/i;

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function storageKey(scope: OperationalOutboxScope) {
  if (!scope.tenantId || !scope.branchId) throw new Error("Operational outbox scope is required.");
  return `${STORAGE_PREFIX}:${scope.tenantId}:${scope.branchId}`;
}

function readEntries(storage: StorageLike | null, key: string): OperationalOutboxEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertSafeValue(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(assertSafeValue);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKey.test(key)) {
      throw new Error(`Payload field ${key} cannot be persisted locally.`);
    }
    assertSafeValue(nested);
  }
}

function samePayload(left: Record<string, unknown>, right: Record<string, unknown>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pruneExpiredConfirmed(entries: OperationalOutboxEntry[], now = Date.now()) {
  return entries.filter((entry) => {
    if (entry.status !== "confirmed") return true;
    const confirmedAt = Date.parse(entry.receipt?.confirmedAt ?? entry.updatedAt);
    return !Number.isFinite(confirmedAt) || now - confirmedAt <= CONFIRMED_RETENTION_MS;
  });
}

async function withStorageLock<T>(key: string, action: () => T | Promise<T>) {
  const locks = typeof window === "undefined" ? undefined : navigator.locks;
  if (!locks) return action();
  return locks.request(key, { mode: "exclusive" }, action);
}

export function createOperationIdempotencyKey(operation: string) {
  return `${operation}:${crypto.randomUUID()}`;
}

export function createOperationalOutbox(
  scope: OperationalOutboxScope,
  storage = browserStorage(),
  options: OperationalOutboxOptions = {},
) {
  const key = storageKey(scope);
  const maxActiveEntries = options.maxActiveEntries ?? MAX_ACTIVE_ENTRIES;
  if (!Number.isInteger(maxActiveEntries) || maxActiveEntries < 1) {
    throw new Error("Operational outbox capacity must be a positive integer.");
  }
  const persist = (entries: OperationalOutboxEntry[]) => {
    storage?.setItem(key, JSON.stringify(entries));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPERATIONAL_OUTBOX_CHANGED, { detail: { key } }));
    }
  };

  const update = async (
    idempotencyKey: string,
    mutate: (entry: OperationalOutboxEntry) => OperationalOutboxEntry,
  ) =>
    withStorageLock(key, () => {
      const entries = pruneExpiredConfirmed(readEntries(storage, key));
      const index = entries.findIndex((entry) => entry.idempotencyKey === idempotencyKey);
      if (index < 0) throw new Error("Operational outbox entry was not found.");
      const next = [...entries];
      const current = next[index];
      if (!current) throw new Error("Operational outbox entry was not found.");
      next[index] = mutate(current);
      persist(next);
      return next[index];
    });

  return {
    list: async () => withStorageLock(key, () => pruneExpiredConfirmed(readEntries(storage, key))),
    enqueue: async (
      input: Omit<OperationalOutboxEntry, "status" | "attempts" | "createdAt" | "updatedAt">,
    ) =>
      withStorageLock(key, () => {
        if (!input.idempotencyKey || !input.operation || !input.path.startsWith("/")) {
          throw new Error("Operational outbox entry is invalid.");
        }
        if (input.path.startsWith("/api/v1/auth")) {
          throw new Error("Authentication requests cannot be persisted locally.");
        }
        assertSafeValue(input.payload);
        const entries = pruneExpiredConfirmed(readEntries(storage, key));
        const existing = entries.find((entry) => entry.idempotencyKey === input.idempotencyKey);
        if (existing) {
          if (!samePayload(existing.payload, input.payload) || existing.path !== input.path) {
            throw new Error("Idempotency key cannot be reused with a different operation.");
          }
          return existing;
        }
        if (entries.filter((entry) => entry.status !== "confirmed").length >= maxActiveEntries) {
          throw new Error("Operational outbox is full and requires attention.");
        }
        const now = new Date().toISOString();
        const entry: OperationalOutboxEntry = {
          ...input,
          status: "pending",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        };
        persist([...entries, entry]);
        return entry;
      }),
    markAttempt: (idempotencyKey: string) =>
      update(idempotencyKey, ({ error: _error, ...entry }) => ({
        ...entry,
        status: "pending",
        attempts: entry.attempts + 1,
        updatedAt: new Date().toISOString(),
      })),
    markConfirmed: (idempotencyKey: string, receipt: OperationReceipt) =>
      update(idempotencyKey, ({ error: _error, ...entry }) => ({
        ...entry,
        status: "confirmed",
        receipt,
        updatedAt: receipt.confirmedAt,
      })),
    markFailed: (idempotencyKey: string, error: string, requiresAttention = false) =>
      update(idempotencyKey, (entry) => ({
        ...entry,
        status: requiresAttention ? "requires_attention" : "failed",
        error,
        updatedAt: new Date().toISOString(),
      })),
    resolveManually: (idempotencyKey: string) =>
      update(idempotencyKey, ({ error: _error, ...entry }) => ({
        ...entry,
        status: "confirmed",
        receipt: {
          operationId: `manual:${entry.idempotencyKey}`,
          confirmedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })),
    discard: async (idempotencyKey: string) =>
      withStorageLock(key, () => {
        const entries = pruneExpiredConfirmed(readEntries(storage, key));
        const next = entries.filter((entry) => entry.idempotencyKey !== idempotencyKey);
        if (next.length === entries.length) {
          throw new Error("Operational outbox entry was not found.");
        }
        persist(next);
      }),
    pruneConfirmed: async () =>
      withStorageLock(key, () => {
        const entries = readEntries(storage, key);
        const next = pruneExpiredConfirmed(entries);
        persist(next);
        return entries.length - next.length;
      }),
  };
}

export async function retryOperationalOutboxEntry(
  outbox: ReturnType<typeof createOperationalOutbox>,
  idempotencyKey: string,
  send: OperationalCommandSender,
) {
  const entry = (await outbox.list()).find(
    (candidate: OperationalOutboxEntry) => candidate.idempotencyKey === idempotencyKey,
  );
  if (!entry) throw new Error("Operação local não encontrada.");
  if (entry.replayable !== true) {
    throw new Error("Esta operação exige conferência manual e não pode ser repetida.");
  }
  if (entry.status === "confirmed") return entry;
  await outbox.markAttempt(entry.idempotencyKey);
  try {
    const result = await send(entry);
    return outbox.markConfirmed(entry.idempotencyKey, receiptFromResult(entry, result));
  } catch (error) {
    const deterministic = isDeterministicOperationalFailure(error);
    await outbox.markFailed(
      entry.idempotencyKey,
      error instanceof Error ? error.message : "Falha sem confirmação do servidor",
      !deterministic,
    );
    throw error;
  }
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : null;
}

export function isDeterministicOperationalFailure(error: unknown) {
  const status = errorStatus(error);
  return status !== null && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

function receiptFromResult(entry: OperationalOutboxEntry, result: OperationalCommandResult) {
  const operationId = [result.operationId, result.id, result.orderId, result.paymentId].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const version = typeof result.version === "number" ? result.version : undefined;
  return {
    operationId: operationId ?? entry.idempotencyKey,
    ...(version !== undefined ? { version } : {}),
    confirmedAt: new Date().toISOString(),
  };
}

export async function executeOperationalCommand<T extends OperationalCommandResult>(
  outbox: ReturnType<typeof createOperationalOutbox>,
  input: Omit<OperationalOutboxEntry, "status" | "attempts" | "createdAt" | "updatedAt">,
  send: OperationalCommandSender<T>,
) {
  const entry = await outbox.enqueue(input);
  if (entry.status === "confirmed") return { entry, result: null, replayed: true } as const;
  await outbox.markAttempt(entry.idempotencyKey);
  try {
    const result = await send(entry);
    const confirmed = await outbox.markConfirmed(
      entry.idempotencyKey,
      receiptFromResult(entry, result),
    );
    return { entry: confirmed, result, replayed: false } as const;
  } catch (error) {
    const deterministic = isDeterministicOperationalFailure(error);
    await outbox.markFailed(
      entry.idempotencyKey,
      error instanceof Error ? error.message : "Falha sem confirmação do servidor",
      !deterministic,
    );
    throw error;
  }
}

export async function reconcileOperationalOutbox(
  outbox: ReturnType<typeof createOperationalOutbox>,
  send: OperationalCommandSender,
  options: { maxAttempts?: number } = {},
) {
  const maxAttempts = options.maxAttempts ?? 5;
  const entries = (await outbox.list()).filter(
    (entry: OperationalOutboxEntry) =>
      (entry.status === "pending" || entry.status === "requires_attention") &&
      entry.replayable === true &&
      entry.attempts < maxAttempts,
  );
  const summary = { confirmed: 0, failed: 0, requiresAttention: 0 };
  for (const entry of entries) {
    await outbox.markAttempt(entry.idempotencyKey);
    try {
      const result = await send(entry);
      await outbox.markConfirmed(entry.idempotencyKey, receiptFromResult(entry, result));
      summary.confirmed += 1;
    } catch (error) {
      const deterministic = isDeterministicOperationalFailure(error);
      await outbox.markFailed(
        entry.idempotencyKey,
        error instanceof Error ? error.message : "Falha sem confirmação do servidor",
        !deterministic,
      );
      if (deterministic) summary.failed += 1;
      else summary.requiresAttention += 1;
    }
  }
  return summary;
}
