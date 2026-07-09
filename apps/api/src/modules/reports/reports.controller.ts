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
}
