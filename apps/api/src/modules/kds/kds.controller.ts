import { orderItemStatuses } from "@giromesa/domain";
import { Body, Controller, Get, Headers, Inject, Param, Patch } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { KdsService } from "./kds.service";

const updateTicketSchema = z.object({
  status: z.enum(orderItemStatuses),
});

@Controller("kds")
export class KdsController {
  constructor(
    @Inject(KdsService)
    private readonly kdsService: KdsService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get("tickets")
  async listTickets(@Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.kdsService.listTickets(context),
    };
  }

  @Get("stations")
  async listStations(@Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.kdsService.listStations(context),
    };
  }

  @Patch("tickets/:ticketId")
  async updateTicket(
    @Param("ticketId") ticketId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = updateTicketSchema.parse(body);
    return this.kdsService.updateTicket(context, ticketId, input.status);
  }

  private async contextWithPermission(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "kds:operate");
    return context;
  }
}
