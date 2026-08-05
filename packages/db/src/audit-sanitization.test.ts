import { describe, expect, it, vi } from "vitest";
import { withAuditSanitization } from "./audit-sanitization";
import { auditLogs } from "./schema";

describe("audit persistence boundary", () => {
  it("sanitizes metadata for direct and transactional audit inserts", async () => {
    const persisted: unknown[] = [];
    const makeClient = () => ({
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((rows: unknown) => {
          persisted.push({ table, rows });
          return Promise.resolve(rows);
        }),
      })),
      transaction: vi.fn(async (callback: (tx: object) => unknown) => callback(makeClient())),
    });
    const db = withAuditSanitization(makeClient());
    const error = Object.assign(new Error("contact person@example.test"), {
      code: "E_PROVIDER",
      correlationId: "corr-1",
    });
    const metadata = {
      email: "person@example.test",
      note: "Bearer synthetic-token and person@example.test",
      requestId: "request-1",
      happenedAt: new Date("2026-08-05T00:00:00.000Z"),
      error,
    };

    await db.insert(auditLogs).values({ metadata });
    await db.transaction(async (tx) => {
      const client = tx as ReturnType<typeof makeClient>;
      await client.insert(auditLogs).values({ metadata });
    });

    expect(persisted).toHaveLength(2);
    for (const entry of persisted as Array<{ rows: { metadata: typeof metadata } }>) {
      expect(entry.rows.metadata.email).toBe("[REDACTED]");
      expect(entry.rows.metadata.note).not.toContain("person@example.test");
      expect(entry.rows.metadata.requestId).toBe("request-1");
      expect(entry.rows.metadata.happenedAt).toBeInstanceOf(Date);
      expect(entry.rows.metadata.error).toBeInstanceOf(Error);
      expect(entry.rows.metadata.error.message).toBe("contact [REDACTED]");
      expect(entry.rows.metadata.error.code).toBe("E_PROVIDER");
      expect(entry.rows.metadata.error.correlationId).toBe("corr-1");
    }
  });

  it("does not alter inserts for other tables", async () => {
    const values = vi.fn((rows: unknown) => rows);
    const db = withAuditSanitization({ insert: vi.fn((_table: unknown) => ({ values })) });
    const table = {};
    const input = { metadata: { email: "not-an-audit@example.test" } };
    db.insert(table).values(input);
    expect(values).toHaveBeenCalledWith(input);
  });
});
