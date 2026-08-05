import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { StaffFinanceService } from "./staff-finance.service";

const branch = z.string().uuid();
const idempotency = z.string().min(8).max(180);
const policy = z.object({
  branchId: branch,
  attributionMode: z.enum(["table_responsible", "item_author", "shift_pool"]),
  serviceRateBps: z.number().int().min(0).max(10_000),
  serviceBase: z.enum(["net_consumption", "gross_consumption", "manual"]),
  requireWaiterConfirmation: z.boolean().default(false),
  poolRules: z.record(z.string(), z.unknown()).optional(),
  confirmedLegalReview: z.literal(true),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotency,
});
const charge = z.object({
  action: z.enum(["accept", "remove", "manual"]),
  manualCents: z.number().int().nonnegative().optional(),
  reason: z.string().min(3).max(500).optional(),
  expectedVersion: z.number().int().positive(),
});
const occurrence = z.object({
  branchId: branch,
  orderId: z.string().uuid().optional(),
  type: z.string().min(2).max(60),
  report: z.string().min(5).max(2_000),
  idempotencyKey: idempotency,
});
const decision = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["house_loss", "dismissed", "approved"]),
  note: z.string().max(2_000).optional(),
  idempotencyKey: idempotency,
});
const recovery = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().min(2).max(40),
  reference: z.string().max(160).optional(),
  note: z.string().max(2_000).optional(),
  idempotencyKey: idempotency,
});
const commissionRules = z.object({
  rateBps: z.number().int().min(0).max(10_000).optional(),
  targetCents: z.number().int().nonnegative().optional(),
  bonusCents: z.number().int().nonnegative().optional(),
  bands: z
    .array(
      z.object({
        startCents: z.number().int().nonnegative(),
        endCents: z.number().int().positive().optional(),
        rateBps: z.number().int().min(0).max(10_000),
      }),
    )
    .max(20)
    .optional(),
});
const commissionPolicy = z.object({
  branchId: branch,
  name: z.string().min(2).max(120),
  model: z.enum([
    "fixed_rate",
    "whole_band",
    "progressive_bands",
    "target_bonus",
    "rate_plus_bonus",
  ]),
  period: z.enum(["shift", "week", "month"]),
  base: z.enum(["net_confirmed_sales", "net_paid_sales", "service_received"]),
  attributionMode: z.enum(["table_responsible", "item_author", "shift_pool"]),
  rules: commissionRules,
  memberIds: z.array(z.string().uuid()).max(200).default([]),
  confirmedLegalReview: z.literal(true),
  idempotencyKey: idempotency,
});

@Controller("staff-finance")
export class StaffFinanceController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(StaffFinanceService) private readonly service: StaffFinanceService,
  ) {}

  @Get("service-policy") async getPolicy(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    return this.service.getServicePolicy(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(branchId),
    );
  }
  @Put("service-policy") async savePolicy(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.service.saveServicePolicy(
      await this.context(headers, "staff_finance:manage"),
      policy.parse(body),
    );
  }
  @Patch("orders/:orderId/service-charge") async updateCharge(
    @Headers() headers: HeaderRecord,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.applyServiceCharge(
      await this.context(headers, "pos:operate"),
      branch.parse(orderId),
      charge.parse(body),
    );
  }

  @Get("shifts/:shiftId/settlements") async settlements(
    @Headers() headers: HeaderRecord,
    @Param("shiftId") shiftId: string,
  ) {
    const context = await this.context(headers, "staff_finance:manage");
    const parsedShiftId = branch.parse(shiftId);
    const [data, managerial] = await Promise.all([
      this.service.listSettlements(context, parsedShiftId),
      this.service.getManagerialSettlement(context, parsedShiftId),
    ]);
    return {
      data,
      managerial,
    };
  }
  @Get("settlements/:settlementId") async settlementDetail(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
  ) {
    return this.service.getSettlementDetail(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
    );
  }
  @Get("reports/financial") async financialReport(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
  ) {
    const input = z
      .object({ branchId: branch, shiftId: z.string().uuid().optional() })
      .parse(query);
    return this.service.getFinancialReport(
      await this.context(headers, "staff_finance:manage"),
      input.branchId,
      input.shiftId,
    );
  }
  @Get("reports/financial.csv") async financialReportCsv(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z
      .object({ branchId: branch, shiftId: z.string().uuid().optional() })
      .parse(query);
    const csv = await this.service.financialReportCsv(
      await this.context(headers, "staff_finance:manage"),
      input.branchId,
      input.shiftId,
    );
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header(
      "content-disposition",
      `attachment; filename="fechamento-equipe-${input.shiftId ?? "periodo"}.csv"`,
    );
    return csv;
  }
  @Get("reports/financial/print") async financialReportPrint(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z
      .object({ branchId: branch, shiftId: z.string().uuid().optional() })
      .parse(query);
    const document = await this.service.financialReportPrintHtml(
      await this.context(headers, "staff_finance:manage"),
      input.branchId,
      input.shiftId,
    );
    reply.header("content-type", "text/html; charset=utf-8");
    return document;
  }
  @Get("reports/financial/thermal") async financialReportThermal(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = z
      .object({ branchId: branch, shiftId: z.string().uuid().optional() })
      .parse(query);
    const document = await this.service.financialReportThermal(
      await this.context(headers, "staff_finance:manage"),
      input.branchId,
      input.shiftId,
    );
    reply.header("content-type", "text/plain; charset=utf-8");
    return document;
  }
  @Post("reports/financial/queue") async queueFinancialReport(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z
      .object({
        branchId: branch,
        shiftId: z.string().uuid().optional(),
        printerDeviceId: z.string().uuid(),
        copies: z.number().int().min(1).max(5).default(1),
        idempotencyKey: idempotency,
      })
      .parse(body);
    return this.service.queueFinancialReport(
      await this.context(headers, "staff_finance:manage"),
      input,
    );
  }
  @Post("shifts/:shiftId/calculate") async calculate(
    @Headers() headers: HeaderRecord,
    @Param("shiftId") shiftId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.calculateShift(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(shiftId),
      z.object({ idempotencyKey: idempotency }).parse(body).idempotencyKey,
    );
  }
  @Post("settlements/:settlementId/confirm") async confirm(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionSettlement(
      await this.context(headers, "staff_finance:read_self"),
      branch.parse(settlementId),
      "confirm",
      z
        .object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotency })
        .parse(body),
      true,
    );
  }
  @Post("settlements/:settlementId/check") async check(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionSettlement(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
      "check",
      z
        .object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotency })
        .parse(body),
    );
  }
  @Post("settlements/:settlementId/close") async close(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionSettlement(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
      "close",
      z
        .object({
          expectedVersion: z.number().int().positive(),
          idempotencyKey: idempotency,
        })
        .parse(body),
    );
  }
  @Post("settlements/:settlementId/reopen") async reopen(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionSettlement(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
      "reopen",
      z
        .object({
          expectedVersion: z.number().int().positive(),
          reason: z.string().min(5).max(500),
          idempotencyKey: idempotency,
        })
        .parse(body),
    );
  }
  @Post("managerial-settlements/:settlementId/close") async closeManagerial(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionManagerialSettlement(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
      "close",
      z
        .object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotency })
        .parse(body),
    );
  }
  @Post("managerial-settlements/:settlementId/reopen") async reopenManagerial(
    @Headers() headers: HeaderRecord,
    @Param("settlementId") settlementId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionManagerialSettlement(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(settlementId),
      "reopen",
      z
        .object({
          expectedVersion: z.number().int().positive(),
          reason: z.string().min(5).max(500),
          idempotencyKey: idempotency,
        })
        .parse(body),
    );
  }
  @Get("me/settlements") async mySettlements(
    @Headers() headers: HeaderRecord,
    @Query("shiftId") shiftId: string,
  ) {
    return {
      data: await this.service.listSettlements(
        await this.context(headers, "staff_finance:read_self"),
        branch.parse(shiftId),
        true,
      ),
    };
  }

  @Get("occurrences") async occurrences(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
  ) {
    const input = z
      .object({
        branchId: branch,
        shiftId: z.string().uuid().optional(),
        status: z.string().max(32).optional(),
      })
      .parse(query);
    return {
      data: await this.service.listOccurrences(
        await this.context(headers, "staff_finance:manage"),
        input.branchId,
        input.shiftId,
        input.status,
      ),
    };
  }
  @Get("open-orders") async openOrders(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    return {
      data: await this.service.listOpenOrders(
        await this.context(headers, "staff_finance:manage"),
        branch.parse(branchId),
      ),
    };
  }
  @Get("occurrences/:occurrenceId/events") async occurrenceEvents(
    @Headers() headers: HeaderRecord,
    @Param("occurrenceId") occurrenceId: string,
  ) {
    return {
      data: await this.service.listOccurrenceEvents(
        await this.context(headers, "staff_finance:manage"),
        branch.parse(occurrenceId),
      ),
    };
  }
  @Post("occurrences") async createOccurrence(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.createOccurrence(
      await this.context(headers, "pos:operate"),
      occurrence.parse(body),
    );
  }
  @Post("occurrences/:occurrenceId/transition") async transitionOccurrence(
    @Headers() headers: HeaderRecord,
    @Param("occurrenceId") occurrenceId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.transitionOccurrence(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(occurrenceId),
      decision.parse(body),
    );
  }
  @Post("occurrences/:occurrenceId/recover") async recover(
    @Headers() headers: HeaderRecord,
    @Param("occurrenceId") occurrenceId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.recoverOccurrence(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(occurrenceId),
      recovery.parse(body),
    );
  }
  @Post("occurrence-events/:recordId/reverse") async reverseRecovery(
    @Headers() headers: HeaderRecord,
    @Param("recordId") recordId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.reverseRecovery(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(recordId),
      z.object({ note: z.string().min(5).max(2_000), idempotencyKey: idempotency }).parse(body),
    );
  }

  @Get("commission-policies") async listPolicies(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    return {
      data: await this.service.listCommissionPolicies(
        await this.context(headers, "staff_finance:manage"),
        branch.parse(branchId),
      ),
    };
  }
  @Post("commission-policies/simulate") async simulate(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    await this.context(headers, "staff_finance:manage");
    return this.service.simulateCommission(
      z
        .object({
          baseCents: z.number().int().nonnegative(),
          model: commissionPolicy.shape.model,
          rules: commissionRules,
        })
        .parse(body),
    );
  }
  @Post("commission-policies") async createPolicy(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.createCommissionPolicy(
      await this.context(headers, "staff_finance:manage"),
      commissionPolicy.parse(body),
    );
  }
  @Post("commission-policies/:policyId/activate") async activate(
    @Headers() headers: HeaderRecord,
    @Param("policyId") policyId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z
      .object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotency })
      .parse(body);
    return this.service.activateCommissionPolicy(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(policyId),
      input,
    );
  }
  @Get("commission-accruals") async listAccruals(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string>,
  ) {
    const input = z.object({ branchId: branch, userId: z.string().uuid().optional() }).parse(query);
    return {
      data: await this.service.listAccruals(
        await this.context(headers, "staff_finance:manage"),
        input.branchId,
        input.userId,
      ),
    };
  }
  @Get("commission-payment-records") async listPayments(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    return {
      data: await this.service.listCommissionPayments(
        await this.context(headers, "staff_finance:manage"),
        branch.parse(branchId),
      ),
    };
  }
  @Post("commission-accruals/calculate") async calculateAccrual(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z
      .object({
        policyId: z.string().uuid(),
        userId: z.string().uuid(),
        periodStart: z.coerce.date(),
        periodEnd: z.coerce.date(),
        idempotencyKey: idempotency,
      })
      .parse(body);
    return this.service.calculateCommissionAccrual(
      await this.context(headers, "staff_finance:manage"),
      input,
    );
  }
  @Post("commission-accruals/:accrualId/approve") async approve(
    @Headers() headers: HeaderRecord,
    @Param("accrualId") accrualId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z
      .object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotency })
      .parse(body);
    return this.service.approveAccrual(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(accrualId),
      input.expectedVersion,
      input.idempotencyKey,
    );
  }
  @Post("commission-accruals/:accrualId/reject") async reject(
    @Headers() headers: HeaderRecord,
    @Param("accrualId") accrualId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        reason: z.string().min(5).max(500),
        idempotencyKey: idempotency,
      })
      .parse(body);
    return this.service.rejectAccrual(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(accrualId),
      input.expectedVersion,
      input.reason,
      input.idempotencyKey,
    );
  }
  @Post("commission-accruals/:accrualId/payments") async payment(
    @Headers() headers: HeaderRecord,
    @Param("accrualId") accrualId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.recordCommissionPayment(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(accrualId),
      z
        .object({
          amountCents: z.number().int().positive(),
          informedAt: z.coerce.date(),
          method: z.string().min(2).max(40),
          reference: z.string().max(160).optional(),
          note: z.string().max(2_000).optional(),
          idempotencyKey: idempotency,
        })
        .parse(body),
    );
  }
  @Post("commission-payment-records/:recordId/reverse") async reversePayment(
    @Headers() headers: HeaderRecord,
    @Param("recordId") recordId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.service.reverseCommissionPayment(
      await this.context(headers, "staff_finance:manage"),
      branch.parse(recordId),
      z.object({ note: z.string().min(5).max(2_000), idempotencyKey: idempotency }).parse(body),
    );
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.auth.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
