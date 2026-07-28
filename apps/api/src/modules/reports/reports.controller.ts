import { cashSessionStatuses, paymentMethods } from "@giromesa/domain";
import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { ReportsService } from "./reports.service";

const financialReportSchema = z.object({
  branchId: z.string().uuid().optional(),
  cashSessionId: z.string().uuid().optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  variance: z.enum(["all", "divergent", "balanced"]).default("all"),
  cashSessionStatus: z.enum(cashSessionStatuses).optional(),
  period: z.enum(["today", "week", "month", "shift", "custom"]).default("today"),
  dateFrom: z.iso
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  dateTo: z.iso
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
});

const salesByPeriodSchema = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.string().transform((value) => new Date(value)),
  endDate: z.string().transform((value) => new Date(value)),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

const performanceMetricsSchema = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.string().transform((value) => new Date(value)),
  endDate: z.string().transform((value) => new Date(value)),
});

const financialSummarySchema = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.string().transform((value) => new Date(value)),
  endDate: z.string().transform((value) => new Date(value)),
});

@Controller("reports")
export class ReportsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  @Get("financial")
  async financial(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "reports:read");
    return this.reportsService.financialReport(context, financialReportSchema.parse(query));
  }

  @Get("products")
  async products(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "reports:read");
    return this.reportsService.productSalesReport(context, financialReportSchema.parse(query));
  }

  @Get("sales-by-period")
  async salesByPeriod(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "reports:read");
    return this.reportsService.salesByPeriod(context, salesByPeriodSchema.parse(query));
  }

  @Get("performance")
  async performance(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "reports:read");
    return this.reportsService.performanceMetrics(context, performanceMetricsSchema.parse(query));
  }

  @Get("financial-summary")
  async financialSummary(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "reports:read");
    return this.reportsService.financialSummary(context, financialSummarySchema.parse(query));
  }
}
