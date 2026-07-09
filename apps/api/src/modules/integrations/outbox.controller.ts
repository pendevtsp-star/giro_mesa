import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { OutboxService } from "./outbox.service";

const listOutboxQuerySchema = z.object({
  status: z.string().min(2).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller("integrations/outbox")
export class OutboxController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(OutboxService) private readonly outboxService: OutboxService,
  ) {}

  @Get()
  async listEvents(@Headers() headers: HeaderRecord, @Query() query: unknown) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    const input = listOutboxQuerySchema.parse(query);

    return {
      data: await this.outboxService.listEvents(context, input),
    };
  }
}
