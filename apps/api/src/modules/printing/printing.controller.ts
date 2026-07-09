import type { TenantContext } from "@giromesa/domain";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { ConnectorAuthService } from "./connector-auth.service";
import { PrintingService } from "./printing.service";

const createDeviceSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2),
  role: z.enum(["kitchen", "bar", "cashier", "conference", "fiscal"]),
  connectionType: z.enum(["network", "usb", "os", "mock"]).default("network"),
  address: z.string().optional(),
  port: z.number().int().positive().optional(),
  paperWidth: z.union([z.literal(58), z.literal(80)]).optional(),
  charactersPerLine: z.number().int().min(32).max(56).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const createRouteSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2),
  trigger: z
    .enum(["kds_ticket_created", "order_closed", "payment_confirmed"])
    .default("kds_ticket_created"),
  targetType: z
    .enum([
      "kitchen_ticket",
      "bar_ticket",
      "bill_preview",
      "cash_summary",
      "payment_receipt",
      "fiscal_danfe",
    ])
    .default("kitchen_ticket"),
  stationId: z.string().optional(),
  productCategoryIds: z.array(z.string()).optional(),
  printerDeviceId: z.string().min(1),
  copies: z.number().int().min(1).max(5).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const reprintSchema = z.object({
  reason: z.string().min(5),
});

const failSchema = z.object({
  errorMessage: z.string().min(3),
});

const configureConnectorSchema = z.object({
  branchId: z.string().min(1),
  rotateKey: z.boolean().optional(),
});

const connectorHeartbeatSchema = z.object({
  version: z.string().min(1),
  hostname: z.string().min(1).optional(),
  platform: z.string().optional(),
  dryRun: z.boolean().optional(),
  printerCount: z.number().int().nonnegative().optional(),
});

@Controller("printing")
export class PrintingController {
  constructor(
    @Inject(PrintingService) private readonly printingService: PrintingService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ConnectorAuthService) private readonly connectorAuthService: ConnectorAuthService,
  ) {}

  @Get("devices")
  async listDevices(@Headers() headers: HeaderRecord, @Query("branchId") branchId?: string) {
    const context = await this.context(headers, "hardware:manage");
    return { data: await this.printingService.listDevices(context, branchId) };
  }

  @Post("devices")
  async createDevice(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "hardware:manage");
    return this.printingService.createDevice(context, createDeviceSchema.parse(body));
  }

  @Get("routes")
  async listRoutes(@Headers() headers: HeaderRecord, @Query("branchId") branchId?: string) {
    const context = await this.context(headers, "hardware:manage");
    return { data: await this.printingService.listRoutes(context, branchId) };
  }

  @Post("routes")
  async createRoute(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "hardware:manage");
    return this.printingService.createRoute(context, createRouteSchema.parse(body));
  }

  @Get("jobs")
  async listJobs(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId?: string,
    @Query("status") status?: string,
  ) {
    const context = await this.jobReadContext(headers);
    return {
      data: await this.printingService.listJobs(context, {
        branchId: this.authorizedBranchId(context, branchId),
        status,
      }),
    };
  }

  @Post("jobs/:jobId/retry")
  async retryJob(@Headers() headers: HeaderRecord, @Param("jobId") jobId: string) {
    const context = await this.context(headers, "print:operate");
    return this.printingService.retryJob(context, jobId);
  }

  @Post("jobs/:jobId/reprint")
  async reprintJob(
    @Headers() headers: HeaderRecord,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "print:operate");
    return this.printingService.reprintJob(context, jobId, reprintSchema.parse(body).reason);
  }

  @Post("jobs/:jobId/start")
  async startJob(@Headers() headers: HeaderRecord, @Param("jobId") jobId: string) {
    const context = await this.jobProcessContext(headers);
    return this.printingService.startJob(context, jobId);
  }

  @Post("jobs/:jobId/complete")
  async completeJob(@Headers() headers: HeaderRecord, @Param("jobId") jobId: string) {
    const context = await this.jobProcessContext(headers);
    return this.printingService.completeJob(context, jobId);
  }

  @Post("jobs/:jobId/fail")
  async failJob(
    @Headers() headers: HeaderRecord,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.jobProcessContext(headers);
    return this.printingService.failJob(context, jobId, failSchema.parse(body).errorMessage);
  }

  @Post("connectors/heartbeat")
  async heartbeat(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.connectorAuthService.resolveContext(headers, "print_jobs:process");
    return this.printingService.recordConnectorHeartbeat(
      context,
      connectorHeartbeatSchema.parse(body ?? {}),
    );
  }

  @Get("connectors/config")
  async getConnectorConfig(@Headers() headers: HeaderRecord) {
    const context = await this.context(headers, "hardware:manage");
    return this.printingService.getConnectorConfig(context);
  }

  @Post("connectors/configure")
  async configureConnector(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "hardware:manage");
    return this.printingService.configureConnector(context, configureConnectorSchema.parse(body));
  }

  @Post("connectors/revoke")
  async revokeConnector(@Headers() headers: HeaderRecord) {
    const context = await this.context(headers, "hardware:manage");
    return this.printingService.revokeConnector(context);
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }

  private async jobReadContext(headers: HeaderRecord) {
    if (this.hasConnectorKey(headers)) {
      return this.connectorAuthService.resolveContext(headers, "print_jobs:read");
    }

    return this.context(headers, "print:operate");
  }

  private async jobProcessContext(headers: HeaderRecord) {
    if (this.hasConnectorKey(headers)) {
      return this.connectorAuthService.resolveContext(headers, "print_jobs:process");
    }

    return this.context(headers, "print:operate");
  }

  private hasConnectorKey(headers: HeaderRecord) {
    const value = headers["x-giromesa-connector-key"];
    return Array.isArray(value) ? Boolean(value[0]) : Boolean(value);
  }

  private authorizedBranchId(context: TenantContext, requestedBranchId: string | undefined) {
    if (!context.branchId) {
      return requestedBranchId;
    }

    if (requestedBranchId && requestedBranchId !== context.branchId) {
      throw new ForbiddenException("Connector key is not authorized for this branch");
    }

    return context.branchId;
  }
}
