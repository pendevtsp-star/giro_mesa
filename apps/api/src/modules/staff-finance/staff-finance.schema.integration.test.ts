import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@127.0.0.1:55434/giromesa_validation";

runIntegration("staff finance database integrity", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps one reversal per original financial record", async () => {
    const result = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and indexname in (
           'operational_occurrence_events_reversal_once_idx',
           'commission_payment_records_reversal_once_idx'
         )`,
    );
    expect(result.rows.map((row) => row.indexname).sort()).toEqual([
      "commission_payment_records_reversal_once_idx",
      "operational_occurrence_events_reversal_once_idx",
    ]);
  });

  it("keeps reversal links referentially valid", async () => {
    const result = await pool.query<{ table_name: string; constraint_name: string }>(
      `select tc.table_name, tc.constraint_name
       from information_schema.table_constraints tc
       where tc.table_schema = 'public'
         and tc.constraint_type = 'FOREIGN KEY'
         and tc.table_name in ('operational_occurrence_events', 'commission_payment_records')
         and tc.constraint_name like '%reverses%'`,
    );
    expect(result.rows).toHaveLength(2);
  });

  it("protects occurrence and partnership payment events from mutation", async () => {
    const result = await pool.query<{ tgname: string }>(
      `select tgname from pg_trigger
       where not tgisinternal
         and tgname in (
           'operational_occurrence_events_append_only',
           'commission_payment_records_append_only'
         )`,
    );
    expect(result.rows.map((row) => row.tgname).sort()).toEqual([
      "commission_payment_records_append_only",
      "operational_occurrence_events_append_only",
    ]);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "create temporary table append_only_probe (id integer primary key, value text)",
      );
      await client.query(
        "create trigger append_only_probe_trigger before update or delete on append_only_probe for each row execute function prevent_staff_finance_ledger_mutation() ",
      );
      await client.query("insert into append_only_probe values (1, 'original')");
      await expect(
        client.query("update append_only_probe set value = 'changed' where id = 1"),
      ).rejects.toThrow(/append-only/i);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("persists the canonical managerial bucket and protects one active partnership policy", async () => {
    const table = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'managerial_shift_settlements'",
    );
    const index = await pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and indexname = 'commission_policies_one_active_idx'",
    );
    expect(table.rows).toHaveLength(1);
    expect(index.rows).toHaveLength(1);
  });

  it("persists immutable calculation evidence and idempotent policy mutations", async () => {
    const columns = await pool.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(
      `select table_name,column_name,is_nullable from information_schema.columns
       where table_schema='public'
         and table_name in ('waiter_shift_settlements','managerial_shift_settlements')
         and column_name in ('calculated_at','ledger_hash')`,
    );
    expect(columns.rows).toHaveLength(4);
    expect(columns.rows.every((column) => column.is_nullable === "NO")).toBe(true);
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname='public' and indexname in (
        'staff_service_policies_idempotency_idx',
        'commission_policies_idempotency_idx',
        'commission_policies_activation_idempotency_idx'
      )`,
    );
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual([
      "commission_policies_activation_idempotency_idx",
      "commission_policies_idempotency_idx",
      "staff_service_policies_idempotency_idx",
    ]);
  });
});
