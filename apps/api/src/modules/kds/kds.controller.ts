import { orderItemStatuses } from "@giromesa/domain";
import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { KdsService } from "./kds.service";

const updateTicketSchema = z.object({
  status: z.enum(orderItemStatuses),
});
const updateTicketItemSchema = z.object({
  status: z.enum(orderItemStatuses),
});
const recallSchema = z.object({ stationId: z.string().uuid() });

@Controller("kds")
export class KdsController {
  constructor(
    @Inject(KdsService)
    private readonly kdsService: KdsService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get("tickets")
  async listTickets(
    @Headers() headers: HeaderRecord,
    @Query("stationId") stationId?: string,
    @Query("status") status?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    const input = {
      stationId: stationId ? z.string().uuid().parse(stationId) : undefined,
      status: status ? z.enum(orderItemStatuses).parse(status) : undefined,
    };
    return {
      data:
        input.stationId || input.status
          ? await this.kdsService.listTickets(context, input)
          : await this.kdsService.listTickets(context),
    };
  }

  @Get("stations")
  async listStations(@Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.kdsService.listStations(context),
    };
  }

  @Post("tickets/recall")
  async recallLastDelivered(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.kdsService.recallLastDelivered(context, recallSchema.parse(body).stationId);
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

  @Patch("tickets/:ticketId/items/:itemId")
  async updateTicketItem(
    @Param("ticketId") ticketId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.kdsService.updateTicketItem(
      context,
      ticketId,
      itemId,
      updateTicketItemSchema.parse(body).status,
    );
  }

  private async contextWithPermission(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "kds:operate");
    return context;
  }
}
