import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const importSchema = z.object({
  branchId: z.string().uuid(),
  csv: z
    .string()
    .min(1)
    .max(2 * 1024 * 1024),
  source: z.string().trim().min(2).max(60).optional(),
});
const matchSchema = z.object({
  paymentId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
const resolveSchema = z.object({
  expectedVersion: z.number().int().positive(),
  resolution: z.enum(["accepted", "ignored", "chargeback"]),
  reason: z.string().trim().min(3).max(500),
});

@Controller("finance/payment-reconciliation")
export class PaymentReconciliationController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PaymentReconciliationService) private readonly service: PaymentReconciliationService,
  ) {}

  @Post("imports")
  async import(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.service.importCanonicalCsv(await this.context(headers), importSchema.parse(body));
  }

  @Get("entries")
  async entries(@Headers() headers: HeaderRecord, @Query() query: Record<string, string>) {
    const input = z
      .object({
        branchId: z.string().uuid(),
        status: z.enum(["unmatched", "matched", "divergent", "resolved"]).optional(),
      })
      .parse(query);
    return { data: await this.service.listEntries(await this.context(headers), input) };
  }

  @Post("entries/:id/match")
  async match(@Headers() headers: HeaderRecord, @Param("id") id: string, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.service.match(
      await this.context(headers),
      z.string().uuid().parse(id),
      matchSchema.parse(body),
    );
  }

  @Post("entries/:id/resolve")
  async resolve(@Headers() headers: HeaderRecord, @Param("id") id: string, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.service.resolve(
      await this.context(headers),
      z.string().uuid().parse(id),
      resolveSchema.parse(body),
    );
  }

  private async context(headers: HeaderRecord) {
    const context = await this.auth.resolveContext(headers);
    requirePermission(context, "staff_finance:manage");
    return context;
  }
}
