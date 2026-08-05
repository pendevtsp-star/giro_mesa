import { paymentMethods, tableStatuses } from "@giromesa/domain";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  Sse,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { from, map, switchMap } from "rxjs";
import { z } from "zod";
import { firstHeader, type HeaderRecord, parseCookies } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { OperationalRealtimeService } from "./operational-realtime.service";
import { PaymentSettingsService } from "./payment-settings.service";
import { PosService } from "./pos.service";

const openOrderSchema = z.object({
  channel: z.enum(["counter", "table", "tab", "delivery", "qr"]),
  branchId: z.string().min(1),
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  peopleCount: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(8).max(180),
});
const assignCustomerSchema = z.object({ customerId: z.string().min(1) });

const addItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  notes: z.string().optional(),
  modifiers: z.array(z.record(z.string(), z.unknown())).optional(),
  idempotencyKey: z.string().min(8).max(180),
});

const paymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(paymentMethods),
  idempotencyKey: z.string().min(8),
  registeredVia: z.enum(["waiter", "cashier"]).default("cashier"),
  reference: z.string().max(120).optional(),
  executionMode: z.enum(["manual", "smartpos", "tef"]).default("manual"),
  terminalDeviceId: z.string().uuid().optional(),
  simulatorScenario: z.enum(["authorized", "denied", "unknown", "timeout"]).optional(),
  managerOverride: z.boolean().optional(),
  overrideReason: z.string().trim().min(8).max(240).optional(),
  allocations: z
    .array(
      z
        .object({
          orderItemId: z.string().uuid().optional(),
          seatLabel: z.string().trim().min(1).max(80).optional(),
          amountCents: z.number().int().positive(),
          idempotencyKey: z.string().min(8).max(180),
        })
        .refine((row) => Boolean(row.orderItemId) !== Boolean(row.seatLabel), {
          message: "Informe item ou pessoa, nunca ambos",
        }),
    )
    .max(100)
    .optional(),
});
const paymentSettingsSchema = z.object({
  profile: z.enum(["external_terminal", "smartpos", "tef", "hybrid"]),
  preferredMode: z.enum(["manual", "smartpos", "tef"]),
  allowManualFallback: z.boolean(),
  reconciliationMode: z.enum(["manual", "import", "automatic"]),
  provider: z.string().trim().min(2).max(40).optional(),
  status: z.enum(["disabled", "active"]),
  expectedVersion: z.number().int().positive(),
});
const terminalSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  provider: z.string().trim().min(2).max(40).optional(),
  providerTerminalId: z.string().trim().min(2).max(160).optional(),
  capabilities: z.record(z.string(), z.unknown()).default({}),
});
const paymentActionSchema = z.object({
  idempotencyKey: z.string().min(8).max(180),
  reason: z.string().trim().min(3).max(240).optional(),
  amountCents: z.number().int().positive().optional(),
  managerOverride: z.boolean().optional(),
});

const splitSchema = z.object({
  people: z.number().int().positive(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const businessIntervalSchema = z.object({ opensAt: timeSchema, closesAt: timeSchema });
const businessHoursSchema = z.object({
  weekly: z.array(
    businessIntervalSchema.extend({
      weekday: z.number().int().min(0).max(6),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
  exceptions: z.array(
    z.object({
      date: z.string().date(),
      isClosed: z.boolean(),
      intervals: z.array(businessIntervalSchema),
      reason: z.string().max(160).nullable().optional(),
    }),
  ),
});
const operationalSettingsSchema = z
  .object({
    cleaningMode: z.enum(["manual", "automatic"]).optional(),
    allowWaiterPayments: z.boolean().optional(),
    defaultTheme: z.enum(["light", "dark", "system"]).optional(),
    defaultKdsInputMode: z.enum(["touch", "keyboard", "hybrid", "printer"]).optional(),
    kdsShortcuts: z.record(z.string().min(1).max(20), z.string().min(1).max(20)).optional(),
    waiterResponsibilityPolicy: z.enum(["strict", "collaborative"]).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "At least one setting is required");
const preferencesSchema = z.object({
  branchId: z.string().uuid(),
  theme: z.enum(["light", "dark", "system"]),
  kdsInput: z.enum(["touch", "keyboard", "hybrid", "printer"]),
});
const deviceSchema = preferencesSchema.extend({
  name: z.string().min(2).max(120),
  kind: z.enum(["pos", "salon", "waiter", "kds", "expedition", "cashier"]),
  initialMode: z.enum(["table", "counter", "bar", "cashier", "kds", "expedition"]),
  stationId: z.string().uuid().optional(),
  printerDeviceId: z.string().uuid().optional(),
  allowModeSwitch: z.boolean().default(false),
});

const cashOpenSchema = z.object({
  branchId: z.string().min(1),
  openingAmountCents: z.number().int().nonnegative(),
});

const shiftSchema = z.object({
  branchId: z.string().min(1),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

const cashMovementSchema = z.object({
  branchId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reason: z.string().min(3).max(240),
});

const cashCloseSchema = z.object({
  countedAmountCents: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});
const floorLayoutSchema = z.object({
  branchId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  layout: z.record(
    z.string(),
    z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  ),
});
const createTableSchema = z.object({
  branchId: z.string().min(1),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  seats: z.number().int().min(1).max(40),
  shape: z.enum(["rounded", "square", "circle", "booth"]).optional(),
  areaId: z.string().uuid().nullable().optional(),
});

const mergeTablesSchema = z.object({
  branchId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).min(2).max(8),
});
const waiterAssignmentSchema = z.object({
  branchId: z.string().uuid(),
  tableId: z.string().uuid(),
  waiterUserId: z.string().uuid(),
  reason: z.string().trim().min(3).max(240).optional(),
  source: z.enum(["manager", "area"]).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});
const assignmentVersionsSchema = z
  .record(z.string().uuid(), z.number().int().nonnegative())
  .refine((value) => Object.keys(value).length <= 200, "No more than 200 assignment versions");
const waiterBatchAssignmentSchema = z
  .object({
    branchId: z.string().uuid(),
    waiterUserId: z.string().uuid(),
    areaId: z.string().uuid().optional(),
    tableIds: z.array(z.string().uuid()).min(1).max(200).optional(),
    expectedVersions: assignmentVersionsSchema.optional(),
    reason: z.string().trim().min(3).max(240),
  })
  .refine((input) => Boolean(input.areaId || input.tableIds?.length), {
    message: "Informe um setor ou uma lista de mesas",
  });
const waiterCopyPreviousSchema = z.object({ branchId: z.string().uuid() });
const waiterRedistributeSchema = z.object({
  branchId: z.string().uuid(),
  waiterUserId: z.string().uuid(),
  tableIds: z.array(z.string().uuid()).min(1).max(200).optional(),
  expectedVersions: assignmentVersionsSchema.optional(),
  reason: z.string().trim().min(3).max(240),
});
const waiterClaimSchema = z.object({ branchId: z.string().uuid(), tableId: z.string().uuid() });
const waiterTransferSchema = z.object({
  branchId: z.string().uuid(),
  tableId: z.string().uuid(),
  waiterUserId: z.string().uuid(),
  reason: z.string().trim().min(3).max(240),
  expectedVersion: z.number().int().nonnegative().optional(),
});
const waiterHelpSchema = z.object({
  branchId: z.string().uuid(),
  tableId: z.string().uuid(),
  reason: z.string().trim().min(3).max(240),
  idempotencyKey: z.string().min(8).max(180).optional(),
  expectedAssignmentVersion: z.number().int().positive().optional(),
});
const waiterHelpGrantSchema = z.object({ managerPin: z.string().regex(/^\d{4,8}$/) });

const qrOrderItemUpdateSchema = z.object({
  quantity: z.number().positive().max(99),
  notes: z.string().max(240).optional(),
});

const qrOrderRejectSchema = z.object({
  reason: z.string().min(3).max(240),
});

const qrOrderItemCancelSchema = z.object({
  reason: z.string().min(3).max(240),
});

const discountSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().min(3).max(240),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

const itemCancellationSchema = z.object({
  reason: z.string().min(3).max(240),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

@Controller("pos")
export class PosController {
  constructor(
    @Inject(PosService)
    private readonly posService: PosService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Optional()
    @Inject(OperationalRealtimeService)
    private readonly realtime?: OperationalRealtimeService,
    @Inject(PaymentSettingsService)
    private readonly paymentSettings?: PaymentSettingsService,
  ) {}

  @Get("branches/:branchId/payment-settings")
  async getPaymentSettings(@Headers() headers: HeaderRecord, @Param("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.paymentSettingsService().get(context, z.string().uuid().parse(branchId));
  }

  @Patch("branches/:branchId/payment-settings")
  async updatePaymentSettings(
    @Headers() headers: HeaderRecord,
    @Param("branchId") branchId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.paymentSettingsService().update(
      context,
      z.string().uuid().parse(branchId),
      paymentSettingsSchema.parse(body),
    );
  }

  @Get("payment-terminals")
  async listPaymentTerminals(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return {
      data: await this.paymentSettingsService().listTerminals(
        context,
        z.string().uuid().parse(branchId),
      ),
    };
  }

  @Post("payment-terminals")
  async createPaymentTerminal(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.paymentSettingsService().createTerminal(context, terminalSchema.parse(body));
  }

  @Delete("payment-terminals/:terminalId")
  async revokePaymentTerminal(
    @Headers() headers: HeaderRecord,
    @Param("terminalId") terminalId: string,
  ) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.paymentSettingsService().revokeTerminal(
      context,
      z.string().uuid().parse(terminalId),
    );
  }

  @Get("tables")
  async listTables(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listTables(context, branchId),
    };
  }

  @Get("waiter-assignments")
  async listWaiterAssignments(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.listWaiterAssignments(context, z.string().uuid().parse(branchId)),
    };
  }

  @Post("waiter-assignments")
  async assignWaiter(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.assignWaiter(context, waiterAssignmentSchema.parse(body)),
    };
  }

  @Post("waiter-assignments/batch")
  async assignWaiterBatch(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.assignWaiterBatch(
        context,
        waiterBatchAssignmentSchema.parse(body),
      ),
    };
  }

  @Post("waiter-assignments/copy-previous-shift")
  async copyPreviousWaiterShift(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const { branchId } = waiterCopyPreviousSchema.parse(body);
    return { data: await this.posService.copyPreviousWaiterShift(context, branchId) };
  }

  @Post("waiter-assignments/redistribute-inactive")
  async redistributeInactiveWaiters(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.redistributeInactiveWaiterAssignments(
        context,
        waiterRedistributeSchema.parse(body),
      ),
    };
  }

  @Post("waiter-assignments/claim")
  async claimWaiterAssignment(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.claimWaiterAssignment(context, waiterClaimSchema.parse(body)),
    };
  }

  @Post("waiter-assignments/transfer")
  async transferWaiterAssignment(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.transferWaiterAssignment(
        context,
        waiterTransferSchema.parse(body),
      ),
    };
  }

  @Post("waiter-assignments/help")
  async requestWaiterHelp(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const input = waiterHelpSchema.parse(body);
    return {
      data: await this.posService.requestWaiterHelp(context, {
        ...input,
        idempotencyKey:
          input.idempotencyKey ?? optionalIdempotencyKey(headers) ?? context.requestId,
      }),
    };
  }

  @Get("waiter-assignments/help")
  async listWaiterHelpRequests(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return {
      data: await this.posService.listWaiterHelpRequests(
        context,
        z.string().uuid().parse(branchId),
      ),
    };
  }

  @Post("waiter-assignments/help/:requestId/grant")
  async grantWaiterHelp(
    @Headers() headers: HeaderRecord,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const { managerPin } = waiterHelpGrantSchema.parse(body);
    return {
      data: await this.posService.grantWaiterHelp(
        context,
        z.string().uuid().parse(requestId),
        managerPin,
      ),
    };
  }

  @Post("tables")
  async createTable(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.createTable(context, createTableSchema.parse(body));
  }

  @Patch("tables/:tableId")
  async updateTable(
    @Param("tableId") tableId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const parsed = z
      .object({
        status: z.enum(tableStatuses).optional(),
        reservedName: z.string().max(120).nullable().optional(),
        seats: z.number().int().min(1).max(40).optional(),
        shape: z.enum(["rounded", "square", "circle", "booth"]).optional(),
        areaId: z.string().uuid().nullable().optional(),
        archived: z.boolean().optional(),
        expectedVersion: z.number().int().positive().optional(),
      })
      .parse(body);
    const updates = {
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.reservedName !== undefined ? { reservedName: parsed.reservedName } : {}),
      ...(parsed.seats !== undefined ? { seats: parsed.seats } : {}),
      ...(parsed.shape !== undefined ? { shape: parsed.shape } : {}),
      ...(parsed.areaId !== undefined ? { areaId: parsed.areaId } : {}),
      ...(parsed.archived !== undefined
        ? {
            archivedAt: parsed.archived ? new Date() : null,
            ...(parsed.archived ? { status: "blocked" as const } : {}),
          }
        : {}),
    };
    return {
      data: await this.posService.updateTable(context, tableId, updates, parsed.expectedVersion),
    };
  }

  @Post("merge-tables")
  async mergeTables(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const input = mergeTablesSchema.parse(body);
    return { data: await this.posService.mergeTables(context, input.branchId, input.tableIds) };
  }

  @Delete("unmerge-tables/:tableId")
  async unmergeTables(@Param("tableId") tableId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return { data: await this.posService.unmergeTables(context, tableId) };
  }

  @Get("floor-plan")
  async getFloorPlan(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getFloorPlan(context, branchId);
  }

  @Get("dashboard/summary")
  async getDashboardSummary(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    const resolvedBranchId = branchId ?? context.branchId;
    if (!resolvedBranchId) {
      return {
        salesToday: 0,
        activeOrders: 0,
        occupiedTables: "0/0",
        cashBalance: 0,
        shiftOpen: false,
        cashOpen: false,
        inventoryAlerts: 0,
      };
    }
    return this.posService.getDashboardSummary(context, resolvedBranchId);
  }

  @Patch("floor-plan")
  async saveFloorPlan(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.saveFloorPlan(context, floorLayoutSchema.parse(body));
  }

  @Get("orders/qr-pending")
  async listQrPendingOrders(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listQrPendingOrders(context, branchId),
    };
  }

  @Sse("events")
  events(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }
    if (!this.realtime) throw new ServiceUnavailableException("Realtime service is unavailable");
    const realtime = this.realtime;

    return from(this.contextWithPermission(headers)).pipe(
      switchMap(async (context) => {
        await this.posService.listOperationalEvents(context, branchId, 0, 1);
        return context;
      }),
      switchMap((context) => realtime.stream(context.tenantId, branchId)),
      map((batch) => ({
        id: String(batch.toVersion),
        type: "pos.delta",
        retry: 1_000,
        data: batch,
      })),
    );
  }

  @Get("events/history")
  async listOperationalEvents(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("afterVersion") afterVersion = "0",
    @Query("limit") limit = "100",
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listOperationalEvents(
        context,
        z.string().uuid().parse(branchId),
        z.coerce.number().int().nonnegative().parse(afterVersion),
        z.coerce.number().int().min(1).max(200).parse(limit),
      ),
    };
  }

  @Get("operation-receipts")
  async operationReceipt(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("scope") scope: string,
    @Query("idempotencyKey") idempotencyKey: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getOperationReceipt(context, {
      branchId: z.string().uuid().parse(branchId),
      scope: z
        .enum([
          "waiter.help_request",
          "qr.table_service.activate",
          "order.discount.request",
          "order_item.cancel.request",
        ])
        .parse(scope),
      idempotencyKey: z.string().min(8).max(180).parse(idempotencyKey),
    });
  }

  @Get("session")
  async getOperationalSession(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("tableId") tableId?: string,
    @Query("orderId") orderId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getOperationalSession(context, {
      branchId: z.string().uuid().parse(branchId),
      ...(tableId ? { tableId: z.string().uuid().parse(tableId) } : {}),
      ...(orderId ? { orderId: z.string().uuid().parse(orderId) } : {}),
    });
  }

  @Get("branches/:branchId/operational-settings")
  async getOperationalSettings(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getOperationalSettings(context, z.string().uuid().parse(branchId));
  }

  @Patch("branches/:branchId/operational-settings")
  async updateOperationalSettings(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.updateOperationalSettings(
      context,
      z.string().uuid().parse(branchId),
      operationalSettingsSchema.parse(body),
    );
  }

  @Get("branches/:branchId/business-hours")
  async getBusinessHours(@Param("branchId") branchId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getBusinessHours(context, z.string().uuid().parse(branchId));
  }

  @Patch("branches/:branchId/business-hours")
  async replaceBusinessHours(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.replaceBusinessHours(
      context,
      z.string().uuid().parse(branchId),
      businessHoursSchema.parse(body),
    );
  }

  @Patch("preferences")
  async saveOperationalPreferences(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = preferencesSchema.parse(body);
    return this.posService.saveOperationalPreferences(context, input.branchId, {
      theme: input.theme,
      kdsInput: input.kdsInput,
    });
  }

  @Post("operator-pin")
  async setPersonalPin(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = z
      .object({ branchId: z.string().uuid(), pin: z.string().regex(/^\d{4,8}$/) })
      .parse(body);
    return this.posService.setPersonalPin(context, input.branchId, input.pin);
  }

  @Post("operator-pin/verify")
  async verifyPersonalPin(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = z
      .object({ branchId: z.string().uuid(), pin: z.string().regex(/^\d{4,8}$/) })
      .parse(body);
    return this.posService.verifyPersonalPin(context, input.branchId, input.pin);
  }

  @Post("devices")
  async registerOperationalDevice(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.registerOperationalDevice(context, deviceSchema.parse(body));
  }

  @Get("devices")
  async listOperationalDevices(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId?: string,
  ) {
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return { data: await this.posService.listOperationalDevices(context, branchId) };
  }

  @Post("devices/activate")
  async activateOperationalDevice(
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithOperationalDevicePermission(headers);
    const token = z.object({ token: z.string().min(20).max(180) }).parse(body).token;
    const profile = await this.posService.activateOperationalDevice(context, token);
    reply.header("Set-Cookie", operationalDeviceCookie(token));
    return profile;
  }

  @Get("devices/current")
  async getCurrentOperationalDevice(@Headers() headers: HeaderRecord) {
    const context = await this.contextWithOperationalDevicePermission(headers);
    const token = parseCookies(firstHeader(headers.cookie)).get("gm_operational_device");
    return this.posService.resolveOperationalDevice(context, token);
  }

  @Post("devices/deactivate")
  async deactivateOperationalDevice(
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.contextWithOperationalDevicePermission(headers);
    reply.header("Set-Cookie", operationalDeviceCookie("", 0));
    return { active: false as const };
  }

  @Post("devices/:deviceId/revoke")
  async revokeOperationalDevice(
    @Headers() headers: HeaderRecord,
    @Param("deviceId") deviceId: string,
  ) {
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.revokeOperationalDevice(context, z.string().uuid().parse(deviceId));
  }

  @Get("tables/:tableId/history")
  async listTableHistory(
    @Param("tableId") tableId: string,
    @Headers() headers: HeaderRecord,
    @Query("limit") limit?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listTableHistory(
        context,
        tableId,
        limit ? Number(limit) : undefined,
      ),
    };
  }

  @Post("orders/open")
  async openOrder(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.openOrder(context, openOrderSchema.parse(body));
  }

  @Get("orders/active")
  async getActiveOrder(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("tableId") tableId?: string,
    @Query("orderId") orderId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.getActiveOrder(context, {
        branchId: z.string().uuid().parse(branchId),
        ...(tableId ? { tableId: z.string().uuid().parse(tableId) } : {}),
        ...(orderId ? { orderId: z.string().uuid().parse(orderId) } : {}),
      }),
    };
  }

  @Patch("orders/:orderId/customer")
  async assignCustomer(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.assignCustomer(
      context,
      orderId,
      assignCustomerSchema.parse(body).customerId,
    );
  }

  @Post("orders/:orderId/items")
  async addItem(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.addItem(context, orderId, addItemSchema.parse(body));
  }

  @Post("orders/:orderId/discounts")
  async requestDiscount(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const input = discountSchema.parse(body);
    return this.posService.requestDiscount(context, z.string().uuid().parse(orderId), {
      ...input,
      idempotencyKey: input.idempotencyKey ?? optionalIdempotencyKey(headers) ?? context.requestId,
    });
  }

  @Post("orders/:orderId/items/:itemId/cancel-requests")
  async requestItemCancellation(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const input = itemCancellationSchema.parse(body);
    return this.posService.requestItemCancellation(
      context,
      z.string().uuid().parse(orderId),
      z.string().uuid().parse(itemId),
      {
        ...input,
        idempotencyKey:
          input.idempotencyKey ?? optionalIdempotencyKey(headers) ?? context.requestId,
      },
    );
  }

  @Post("orders/:orderId/send-to-kitchen")
  async sendToKitchen(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:kds_send");
    return this.posService.sendToKitchen(context, orderId);
  }

  @Get("orders/:orderId/production-routing-preview")
  async getProductionRoutingPreview(
    @Param("orderId") orderId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers, "pos:kds_send");
    return this.posService.getProductionRoutingPreview(context, z.string().uuid().parse(orderId));
  }

  @Patch("orders/:orderId/qr-items/:itemId")
  async updateQrOrderItem(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.updateQrOrderItem(
      context,
      orderId,
      itemId,
      qrOrderItemUpdateSchema.parse(body),
    );
  }

  @Post("orders/:orderId/qr-items/:itemId/cancel")
  async cancelQrOrderItem(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.cancelQrOrderItem(
      context,
      orderId,
      itemId,
      qrOrderItemCancelSchema.parse(body),
    );
  }

  @Post("orders/:orderId/qr-reject")
  async rejectQrOrder(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.rejectQrOrder(context, orderId, qrOrderRejectSchema.parse(body));
  }

  @Post("orders/:orderId/split")
  async splitBill(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = splitSchema.parse(body);
    return this.posService.splitBill(context, z.string().uuid().parse(orderId), input.people);
  }

  @Post("orders/:orderId/payments")
  async registerPayment(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.registerPayment(context, orderId, paymentSchema.parse(body));
  }

  @Post("orders/:orderId/payment-intents")
  async createPaymentIntent(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.createPaymentIntent(context, orderId, paymentSchema.parse(body));
  }

  @Get("payments/:paymentId")
  async getPayment(@Param("paymentId") paymentId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.getPayment(context, z.string().uuid().parse(paymentId));
  }

  @Post("payments/:paymentId/query")
  async queryPayment(
    @Param("paymentId") paymentId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.queryPayment(
      context,
      z.string().uuid().parse(paymentId),
      paymentActionSchema.parse(body),
    );
  }

  @Post("payments/:paymentId/cancel")
  async cancelPayment(
    @Param("paymentId") paymentId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.cancelPayment(
      context,
      z.string().uuid().parse(paymentId),
      paymentActionSchema.parse(body),
    );
  }

  @Post("payments/:paymentId/refund")
  async refundOperationalPayment(
    @Param("paymentId") paymentId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.refundPayment(
      context,
      z.string().uuid().parse(paymentId),
      paymentActionSchema.parse(body),
    );
  }

  @Get("orders/:orderId/payments")
  async listOrderPayments(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return {
      data: await this.posService.listOrderPayments(context, orderId),
    };
  }

  @Post("payments/:paymentId/cash-handover/receive")
  async receiveCashHandover(
    @Param("paymentId") paymentId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    z.object({}).parse(body);
    return this.posService.receiveCashHandover(context, z.string().uuid().parse(paymentId));
  }

  @Post("orders/:orderId/close")
  async closeOrder(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:close_order");
    return this.posService.closeOrder(context, orderId);
  }

  @Post("orders/:orderId/print-bill-preview")
  async printBillPreview(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printBillPreview(context, orderId);
  }

  @Post("orders/:orderId/print-payment-receipt")
  async printPaymentReceipt(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printPaymentReceipt(context, orderId);
  }

  @Post("cash-sessions/open")
  async openCashSession(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.openCashSession(context, cashOpenSchema.parse(body));
  }

  @Get("shift/current")
  async getCurrentShift(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.getCurrentShift(context, branchId);
  }

  @Post("shift/open")
  async openShift(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.openShift(context, shiftSchema.parse(body));
  }

  @Post("shift/close")
  async closeShift(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.closeShift(context, shiftSchema.parse(body));
  }

  @Get("cash/current")
  async getCurrentCashSession(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.getCurrentCashSession(context, branchId);
  }

  @Post("cash/open")
  async openCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.openCashSession(context, cashOpenSchema.parse(body));
  }

  @Post("cash/supply")
  async supplyCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.registerCashMovement(context, "supply", cashMovementSchema.parse(body));
  }

  @Post("cash/withdrawal")
  async withdrawCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.registerCashMovement(
      context,
      "withdrawal",
      cashMovementSchema.parse(body),
    );
  }

  @Get("cash-sessions/summary")
  async getCashSessionSummary(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.getCashSessionSummary(context, branchId);
  }

  @Post("cash-sessions/:cashSessionId/close")
  async closeCashSession(
    @Param("cashSessionId") cashSessionId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.closeCashSession(context, cashSessionId, cashCloseSchema.parse(body));
  }

  @Post("cash-sessions/:cashSessionId/print-summary")
  async printCashSummary(
    @Param("cashSessionId") cashSessionId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printCashSummary(context, cashSessionId);
  }

  private async contextWithPermission(headers: HeaderRecord, permission = "pos:operate") {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }

  private paymentSettingsService() {
    if (!this.paymentSettings) {
      throw new ServiceUnavailableException("Payment configuration service is unavailable");
    }
    return this.paymentSettings;
  }

  private async contextWithOperationalDevicePermission(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    if (
      !context.permissions.includes("pos:operate") &&
      !context.permissions.includes("kds:operate")
    ) {
      throw new ForbiddenException({
        error: "forbidden",
        requiredAnyPermission: ["pos:operate", "kds:operate"],
      });
    }
    return context;
  }
}

function operationalDeviceCookie(token: string, maxAgeSeconds = 365 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `gm_operational_device=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

function optionalIdempotencyKey(headers: HeaderRecord) {
  const value = firstHeader(headers["x-idempotency-key"])?.trim();
  if (!value) return undefined;
  return z.string().min(8).max(180).parse(value);
}
