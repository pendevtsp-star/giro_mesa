import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../database/database.service";
import { CashRepository } from "../pos/cash.repository";
import { CashService } from "../pos/cash.service";
import { PosRepository } from "../pos/pos.repository";
import { PaymentsService } from "./payments.service";

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@127.0.0.1:55434/giromesa_validation";

runIntegration("payment refund integrity with PostgreSQL", () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: PaymentsService;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    database = new DatabaseService();
    service = new PaymentsService(database);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
    await pool.end();
  });

  it("isolates branches and serializes concurrent payload-aware refunds", async () => {
    const tenantId = randomUUID();
    const branchA = randomUUID();
    const branchB = randomUUID();
    const userId = randomUUID();
    const orderA = randomUUID();
    const orderB = randomUUID();
    const chargeA = randomUUID();
    const chargeB = randomUUID();
    const context = {
      tenantId,
      branchId: branchA,
      userId,
      requestId: "refund-integration",
      permissions: ["payment:refund"],
    };
    try {
      await pool.query("insert into tenants (id,name,slug) values ($1,'Refund test',$2)", [
        tenantId,
        `refund-${tenantId}`,
      ]);
      await pool.query("insert into branches (id,tenant_id,name) values ($1,$3,'A'),($2,$3,'B')", [
        branchA,
        branchB,
        tenantId,
      ]);
      await pool.query("insert into users (id,tenant_id,email,name) values ($1,$2,$3,'Manager')", [
        userId,
        tenantId,
        `${userId}@test.local`,
      ]);
      await pool.query(
        "insert into orders (id,tenant_id,branch_id,channel,status,total_cents) values ($1,$3,$4,'table','paid',1000),($2,$3,$5,'table','paid',1000)",
        [orderA, orderB, tenantId, branchA, branchB],
      );
      await pool.query(
        "insert into payments (id,tenant_id,branch_id,order_id,method,status,payment_type,amount_cents,idempotency_key,confirmed_at) values ($1,$3,$4,$5,'cash','confirmed','charge',1000,$7,now()),($2,$3,$6,$8,'cash','confirmed','charge',1000,$9,now())",
        [chargeA, chargeB, tenantId, branchA, orderA, branchB, randomUUID(), orderB, randomUUID()],
      );

      await expect(service.refundPayment(context, chargeB, 100)).rejects.toThrow(/branch/i);

      const replayKey = randomUUID();
      const concurrentReplay = await Promise.all([
        service.refundPayment(context, chargeA, 500, "partial", replayKey),
        service.refundPayment(context, chargeA, 500, "partial", replayKey),
      ]);
      expect(concurrentReplay.filter((result) => result.duplicate)).toHaveLength(1);
      await expect(
        service.refundPayment(context, chargeA, 400, "changed", replayKey),
      ).rejects.toThrow(/different refund payload/i);

      const competitors = await Promise.allSettled([
        service.refundPayment(context, chargeA, 500, "remaining", randomUUID()),
        service.refundPayment(context, chargeA, 500, "remaining competitor", randomUUID()),
      ]);
      expect(competitors.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(competitors.filter((result) => result.status === "rejected")).toHaveLength(1);
      const ledger = await pool.query<{ refund_cents: number; net_cents: number }>(
        `select
          coalesce(sum(amount_cents) filter (where payment_type='refund'),0)::int as refund_cents,
          coalesce(sum(case when payment_type='charge' and status='confirmed' then amount_cents when payment_type='refund' and status='refunded' then -amount_cents else 0 end),0)::int as net_cents
         from payments where tenant_id=$1 and (id=$2 or original_payment_id=$2)`,
        [tenantId, chargeA],
      );
      expect(ledger.rows[0]).toEqual({ refund_cents: 1000, net_cents: 0 });
    } finally {
      await pool.query("delete from operational_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from outbox_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from audit_logs where tenant_id=$1", [tenantId]);
      await pool.query("delete from payments where tenant_id=$1", [tenantId]);
      await pool.query("delete from orders where tenant_id=$1", [tenantId]);
      await pool.query("delete from users where tenant_id=$1", [tenantId]);
      await pool.query("delete from branches where tenant_id=$1", [tenantId]);
      await pool.query("delete from tenants where id=$1", [tenantId]);
    }
  });

  it("keeps persisted and derived cash expectation net after a partial cash refund", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();
    const orderId = randomUUID();
    const chargeId = randomUUID();
    const cashSessionId = randomUUID();
    const context = {
      tenantId,
      branchId,
      userId,
      requestId: "cash-refund-integration",
      permissions: ["payment:refund"],
    };
    try {
      await pool.query("insert into tenants (id,name,slug) values ($1,'Cash refund test',$2)", [
        tenantId,
        `cash-refund-${tenantId}`,
      ]);
      await pool.query("insert into branches (id,tenant_id,name) values ($1,$2,'Matriz')", [
        branchId,
        tenantId,
      ]);
      await pool.query("insert into users (id,tenant_id,email,name) values ($1,$2,$3,'Cashier')", [
        userId,
        tenantId,
        `${userId}@test.local`,
      ]);
      await pool.query(
        "insert into cash_sessions (id,tenant_id,branch_id,operator_id,status,opening_amount_cents,expected_amount_cents,opened_at) values ($1,$2,$3,$4,'open',100,1100,now() - interval '1 minute')",
        [cashSessionId, tenantId, branchId, userId],
      );
      await pool.query(
        "insert into orders (id,tenant_id,branch_id,channel,status,total_cents) values ($1,$2,$3,'table','paid',1000)",
        [orderId, tenantId, branchId],
      );
      await pool.query(
        "insert into payments (id,tenant_id,branch_id,order_id,method,status,payment_type,amount_cents,idempotency_key,registered_by_user_id,registered_via,cash_handover_status,confirmed_at) values ($1,$2,$3,$4,'cash','confirmed','charge',1000,$5,$6,'cashier','received',now())",
        [chargeId, tenantId, branchId, orderId, randomUUID(), userId],
      );

      await service.refundPayment(context, chargeId, 400, "partial cash return", randomUUID());

      const persisted = await pool.query<{ expected_amount_cents: number }>(
        "select expected_amount_cents from cash_sessions where id=$1",
        [cashSessionId],
      );
      expect(persisted.rows[0]?.expected_amount_cents).toBe(700);

      const cashService = new CashService(
        new CashRepository(database),
        new PosRepository(database),
        database,
      );
      const summary = await cashService.getCashSessionSummary(context, branchId);
      expect(summary.session?.expectedAmountCents).toBe(700);
      expect(summary.payments.byMethod.cash).toBe(600);

      const closed = await cashService.closeCashSession(context, cashSessionId, {
        countedAmountCents: 700,
        idempotencyKey: randomUUID(),
      });
      expect(closed).toMatchObject({
        status: "closed",
        expectedAmountCents: 700,
        differenceCents: 0,
      });
    } finally {
      await pool.query("delete from operational_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from outbox_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from audit_logs where tenant_id=$1", [tenantId]);
      await pool.query("delete from payments where tenant_id=$1", [tenantId]);
      await pool.query("delete from orders where tenant_id=$1", [tenantId]);
      await pool.query("delete from cash_sessions where tenant_id=$1", [tenantId]);
      await pool.query("delete from users where tenant_id=$1", [tenantId]);
      await pool.query("delete from branches where tenant_id=$1", [tenantId]);
      await pool.query("delete from tenants where id=$1", [tenantId]);
    }
  });
});
