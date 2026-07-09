import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "./audit.service";

const listAuditQuerySchema = z.object({
  action: z.string().min(2).max(120).optional(),
  userId: z.string().uuid().optional(),
  entityType: z.string().min(2).max(120).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller("audit")
export class AuditController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get("events")
  async listEvents(@Headers() headers: HeaderRecord, @Query() query: unknown) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    const input = listAuditQuerySchema.parse(query);

    return {
      data: await this.auditService.listEvents(context, input),
    };
  }
}
