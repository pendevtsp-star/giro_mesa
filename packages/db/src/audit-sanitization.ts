import { sanitizeSensitiveData } from "@giromesa/config";
import { auditLogs } from "./schema";

type Callable = (...args: unknown[]) => unknown;
type DynamicObject = Record<PropertyKey, unknown>;

export function withAuditSanitization<T extends object>(database: T): T {
  const cache = new WeakMap<object, object>();

  const wrapClient = <Client extends object>(client: Client): Client => {
    const cached = cache.get(client);
    if (cached) return cached as Client;
    const proxy = new Proxy(client as DynamicObject, {
      get(target, property, receiver) {
        if (property === "insert") {
          const insert = Reflect.get(target, property, receiver) as Callable;
          return (table: unknown) => {
            const builder = insert.call(target, table) as DynamicObject;
            if (table !== auditLogs) return builder;
            return new Proxy(builder, {
              get(builderTarget, builderProperty, builderReceiver) {
                if (builderProperty === "values") {
                  const values = Reflect.get(
                    builderTarget,
                    builderProperty,
                    builderReceiver,
                  ) as Callable;
                  return (rows: unknown) => values.call(builderTarget, sanitizeAuditRows(rows));
                }
                const value = Reflect.get(builderTarget, builderProperty, builderReceiver);
                return typeof value === "function" ? value.bind(builderTarget) : value;
              },
            });
          };
        }
        if (property === "transaction") {
          const transaction = Reflect.get(target, property, receiver) as Callable;
          return (callback: (tx: object) => unknown, ...args: unknown[]) =>
            transaction.call(target, (tx: object) => callback(wrapClient(tx)), ...args);
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    cache.set(client, proxy);
    return proxy as Client;
  };

  return wrapClient(database);
}

function sanitizeAuditRows(rows: unknown) {
  if (Array.isArray(rows)) return rows.map(sanitizeAuditRow);
  return sanitizeAuditRow(rows);
}

function sanitizeAuditRow(row: unknown) {
  if (!row || typeof row !== "object") return row;
  const record = row as Record<string, unknown>;
  if (!("metadata" in record)) return row;
  return { ...record, metadata: sanitizeSensitiveData(record.metadata) };
}
