import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../database/database.service";
import { StaffFinanceService } from "./staff-finance.service";

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@127.0.0.1:55434/giromesa_validation";

runIntegration("staff finance service with PostgreSQL", () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: StaffFinanceService;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    database = new DatabaseService();
    service = new StaffFinanceService(database, {} as never);
  });
  afterAll(async () => {
    await database.onModuleDestroy();
    await pool.end();
  });

  it("persists mixed attribution, closes both buckets and passes the shift gate", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const managerId = randomUUID();
    const waiterId = randomUUID();
    const shiftId = randomUUID();
    const productId = randomUUID();
    const orderId = randomUUID();
    const roleId = randomUUID();
    const slug = `staff-${tenantId}`;
    const context = {
      tenantId,
      branchId,
      userId: managerId,
      requestId: "staff-integration",
      permissions: ["staff_finance:manage"],
    };
    try {
      await pool.query("insert into tenants (id,name,slug) values ($1,'Staff test',$2)", [
        tenantId,
        slug,
      ]);
      await pool.query("insert into branches (id,tenant_id,name) values ($1,$2,'Branch')", [
        branchId,
        tenantId,
      ]);
      await pool.query(
        "insert into users (id,tenant_id,email,name) values ($1,$2,$3,'Manager'),($4,$2,$5,'Waiter')",
        [managerId, tenantId, `${managerId}@test.local`, waiterId, `${waiterId}@test.local`],
      );
      await pool.query(
        "insert into roles (id,tenant_id,code,name) values ($1,$2,'waiter-test','Waiter')",
        [roleId, tenantId],
      );
      await pool.query(
        "insert into user_roles (tenant_id,user_id,role_id,branch_id) values ($1,$2,$3,$4)",
        [tenantId, waiterId, roleId, branchId],
      );
      const policy = await service.createCommissionPolicy(context, {
        branchId,
        name: "Partnership",
        model: "fixed_rate",
        period: "shift",
        base: "net_confirmed_sales",
        attributionMode: "table_responsible",
        rules: { rateBps: 1_000 },
        memberIds: [waiterId],
        confirmedLegalReview: true,
        idempotencyKey: randomUUID(),
      });
      await service.activateCommissionPolicy(context, policy.id, {
        expectedVersion: policy.version,
        idempotencyKey: randomUUID(),
      });
      const openedAt = new Date(Date.now() + 10);
      await pool.query(
        "insert into products (id,tenant_id,name,price_cents) values ($1,$2,'Item',100)",
        [productId, tenantId],
      );
      await pool.query(
        "insert into operational_shifts (id,tenant_id,branch_id,opened_by_user_id,status,opened_at) values ($1,$2,$3,$4,'open',$5)",
        [shiftId, tenantId, branchId, managerId, openedAt],
      );
      await pool.query(
        "insert into staff_service_policies (tenant_id,branch_id,version,is_active,attribution_mode,service_rate_bps,service_base,confirmed_legal_review,created_by_user_id) values ($1,$2,1,true,'table_responsible',1000,'net_consumption',true,$3)",
        [tenantId, branchId, managerId],
      );
      await pool.query(
        "insert into orders (id,tenant_id,branch_id,channel,status,shift_id,subtotal_cents,service_charge_suggested_cents,service_charge_cents,total_cents) values ($1,$2,$3,'table','served',$4,200,20,20,220)",
        [orderId, tenantId, branchId, shiftId],
      );
      await pool.query(
        "insert into order_items (tenant_id,order_id,product_id,name_snapshot,quantity,unit_price_cents,total_cents,status,shift_id,responsible_waiter_user_id) values ($1,$2,$3,'Assigned',1,100,100,'served',$4,$5),($1,$2,$3,'QR',1,100,100,'served',$4,null)",
        [tenantId, orderId, productId, shiftId, waiterId],
      );
      await pool.query(
        "insert into payments (tenant_id,branch_id,order_id,method,status,amount_cents,idempotency_key,cash_handover_status,confirmed_at) values ($1,$2,$3,'pix','confirmed',220,$4,'not_required',now())",
        [tenantId, branchId, orderId, randomUUID()],
      );
      await expect(service.assertCanCloseShift(context, shiftId)).rejects.toThrow(/calcule/i);
      const calculated = await service.calculateShift(context, shiftId, randomUUID());
      expect(calculated.data).toHaveLength(1);
      expect(calculated.data[0]).toMatchObject({
        waiterUserId: waiterId,
        netConsumptionCents: 100,
        serviceReceivedCents: 10,
        status: "checked",
      });
      expect(calculated.managerial).toMatchObject({
        netConsumptionCents: 100,
        serviceReceivedCents: 10,
        status: "checked",
      });
      let waiterSettlement = calculated.data[0];
      let managerialSettlement = calculated.managerial;
      if (!waiterSettlement || !managerialSettlement) {
        throw new Error("O cálculo deve gerar os fechamentos do garçom e da gerência");
      }
      await pool.query(
        "update orders set version=version+1, updated_at=now() where tenant_id=$1 and id=$2",
        [tenantId, orderId],
      );
      await expect(
        service.transitionSettlement(context, waiterSettlement.id, "close", {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow(/recalcul/i);
      let recalculated = await service.calculateShift(context, shiftId, randomUUID());
      waiterSettlement = recalculated.data[0];
      managerialSettlement = recalculated.managerial;
      if (!waiterSettlement || !managerialSettlement) {
        throw new Error("O recálculo deve renovar os dois snapshots");
      }
      const occurrenceId = randomUUID();
      await pool.query(
        "insert into operational_occurrences (id,tenant_id,branch_id,shift_id,responsible_waiter_user_id,type,initial_report,status,decision,unpaid_balance_cents) values ($1,$2,$3,$4,$5,'unpaid_exit','Test','closed','approved',100)",
        [occurrenceId, tenantId, branchId, shiftId, waiterId],
      );
      await expect(
        service.transitionSettlement(context, waiterSettlement.id, "close", {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow(/recalcul/i);
      recalculated = await service.calculateShift(context, shiftId, randomUUID());
      waiterSettlement = recalculated.data[0];
      managerialSettlement = recalculated.managerial;
      if (!waiterSettlement || !managerialSettlement) {
        throw new Error("A ocorrência deve renovar os dois snapshots");
      }
      await pool.query(
        "insert into operational_occurrence_events (tenant_id,occurrence_id,event_type,resulting_status,amount_cents) values ($1,$2,'recovery','closed',100)",
        [tenantId, occurrenceId],
      );
      await expect(
        service.transitionSettlement(context, waiterSettlement.id, "close", {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow(/recalcul/i);
      recalculated = await service.calculateShift(context, shiftId, randomUUID());
      waiterSettlement = recalculated.data[0];
      managerialSettlement = recalculated.managerial;
      if (!waiterSettlement || !managerialSettlement) {
        throw new Error("O evento financeiro deve renovar os dois snapshots");
      }
      await service.transitionSettlement(context, waiterSettlement.id, "close", {
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      });
      await service.transitionManagerialSettlement(context, managerialSettlement.id, "close", {
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      });
      await expect(service.assertCanCloseShift(context, shiftId)).resolves.toBeUndefined();
      const closedAt = new Date(Math.max(Date.now(), openedAt.getTime() + 1_000));
      await pool.query("update operational_shifts set status='closed', closed_at=$2 where id=$1", [
        shiftId,
        closedAt,
      ]);
      const shiftWindow = await pool.query<{ opened_at: Date; closed_at: Date }>(
        "select opened_at,closed_at from operational_shifts where id=$1",
        [shiftId],
      );
      const periodStart = shiftWindow.rows[0]?.opened_at;
      const periodEnd = shiftWindow.rows[0]?.closed_at;
      if (!periodStart || !periodEnd) throw new Error("O turno deve possuir limites exatos");
      const accrual = await service.calculateCommissionAccrual(context, {
        policyId: policy.id,
        userId: waiterId,
        periodStart,
        periodEnd,
        idempotencyKey: randomUUID(),
      });
      expect(accrual).toMatchObject({ baseCents: 100, calculatedCents: 10, status: "calculated" });
      const approved = await service.approveAccrual(context, accrual.id, 1, randomUUID());
      expect(approved.status).toBe("approved");
      const payment = await service.recordCommissionPayment(context, accrual.id, {
        amountCents: 10,
        informedAt: new Date(),
        method: "informado",
        idempotencyKey: randomUUID(),
      });
      expect(payment.amountCents).toBe(10);
      await service.reverseCommissionPayment(context, payment.id, {
        note: "Pagamento informado incorretamente",
        idempotencyKey: randomUUID(),
      });
      const statusAfterReversal = await pool.query<{ status: string; paid_cents: number }>(
        "select status,paid_cents from commission_accruals where id=$1",
        [accrual.id],
      );
      expect(statusAfterReversal.rows[0]).toMatchObject({ status: "reversed", paid_cents: 0 });
      await service.transitionSettlement(context, waiterSettlement.id, "reopen", {
        expectedVersion: 2,
        reason: "Conferência reaberta",
        idempotencyKey: randomUUID(),
      });
      await expect(
        service.calculateCommissionAccrual(context, {
          policyId: policy.id,
          userId: waiterId,
          periodStart,
          periodEnd,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow(/reaberto|não concluído/i);
    } finally {
      await pool.query("delete from operational_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from outbox_events where tenant_id=$1", [tenantId]);
      await pool.query("delete from audit_logs where tenant_id=$1", [tenantId]);
      await pool.query("delete from operation_idempotency where tenant_id=$1", [tenantId]);
      await pool.query(
        "alter table operational_occurrence_events disable trigger operational_occurrence_events_append_only",
      );
      try {
        await pool.query("delete from operational_occurrence_events where tenant_id=$1", [
          tenantId,
        ]);
      } finally {
        await pool.query(
          "alter table operational_occurrence_events enable trigger operational_occurrence_events_append_only",
        );
      }
      await pool.query("delete from operational_occurrences where tenant_id=$1", [tenantId]);
      await pool.query(
        "alter table commission_payment_records disable trigger commission_payment_records_append_only",
      );
      try {
        await pool.query("delete from commission_payment_records where tenant_id=$1", [tenantId]);
      } finally {
        await pool.query(
          "alter table commission_payment_records enable trigger commission_payment_records_append_only",
        );
      }
      await pool.query("delete from commission_accruals where tenant_id=$1", [tenantId]);
      await pool.query("delete from commission_policy_members where tenant_id=$1", [tenantId]);
      await pool.query("delete from commission_policies where tenant_id=$1", [tenantId]);
      await pool.query("delete from managerial_shift_settlements where tenant_id=$1", [tenantId]);
      await pool.query("delete from waiter_shift_settlements where tenant_id=$1", [tenantId]);
      await pool.query("delete from payments where tenant_id=$1", [tenantId]);
      await pool.query("delete from order_items where tenant_id=$1", [tenantId]);
      await pool.query("delete from orders where tenant_id=$1", [tenantId]);
      await pool.query("delete from staff_service_policies where tenant_id=$1", [tenantId]);
      await pool.query("delete from operational_shifts where tenant_id=$1", [tenantId]);
      await pool.query("delete from products where tenant_id=$1", [tenantId]);
      await pool.query("delete from user_roles where tenant_id=$1", [tenantId]);
      await pool.query("delete from roles where tenant_id=$1", [tenantId]);
      await pool.query("delete from users where tenant_id=$1", [tenantId]);
      await pool.query("delete from branches where tenant_id=$1", [tenantId]);
      await pool.query("delete from tenants where id=$1", [tenantId]);
    }
  });
});
