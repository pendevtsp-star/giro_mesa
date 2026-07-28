import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { FloorService } from "./floor.service";

const areaSchema = z.object({
  name: z.string().min(2).max(120),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
});

const reservationSchema = z.object({
  tableId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(2).max(160),
  customerPhone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).max(100),
  scheduledAt: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

const reservationUpdateSchema = z.object({
  status: z.enum(["booked", "arrived", "seated", "no_show", "canceled"]).optional(),
  tableId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const waitlistSchema = z.object({
  tableId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(2).max(160),
  customerPhone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).max(100),
  quotedWaitMinutes: z.number().int().nonnegative().max(1440).optional(),
  notes: z.string().max(500).optional(),
});

const waitlistUpdateSchema = z.object({
  status: z.enum(["waiting", "notified", "seated", "left", "canceled"]).optional(),
  tableId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

@Controller("floor")
export class FloorController {
  constructor(
    @Inject(FloorService) private readonly floorService: FloorService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("areas")
  async listAreas(@Headers() headers: HeaderRecord) {
    return { data: await this.floorService.listAreas(await this.context(headers)) };
  }

  @Post("areas")
  async createArea(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.floorService.createArea(await this.context(headers), areaSchema.parse(body));
  }

  @Patch("areas/:areaId")
  async updateArea(
    @Headers() headers: HeaderRecord,
    @Param("areaId") areaId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.floorService.updateArea(
      await this.context(headers),
      z.string().uuid().parse(areaId),
      areaSchema.partial().parse(body),
    );
  }

  @Get("reservations")
  async listReservations(@Headers() headers: HeaderRecord, @Query("status") status?: string) {
    return {
      data: await this.floorService.listReservations(
        await this.context(headers),
        status
          ? z.enum(["booked", "arrived", "seated", "no_show", "canceled"]).parse(status)
          : undefined,
      ),
    };
  }

  @Post("reservations")
  async createReservation(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.floorService.createReservation(
      await this.context(headers),
      reservationSchema.parse(body),
    );
  }

  @Patch("reservations/:reservationId")
  async updateReservation(
    @Headers() headers: HeaderRecord,
    @Param("reservationId") reservationId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.floorService.updateReservation(
      await this.context(headers),
      z.string().uuid().parse(reservationId),
      reservationUpdateSchema.parse(body),
    );
  }

  @Post("reservations/:reservationId/seat")
  async seatReservation(
    @Headers() headers: HeaderRecord,
    @Param("reservationId") reservationId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z.object({ tableId: z.string().uuid() }).parse(body);
    return this.floorService.seatReservation(
      await this.context(headers),
      z.string().uuid().parse(reservationId),
      input.tableId,
    );
  }

  @Get("waitlist")
  async listWaitlist(@Headers() headers: HeaderRecord, @Query("status") status?: string) {
    return {
      data: await this.floorService.listWaitlist(
        await this.context(headers),
        status
          ? z.enum(["waiting", "notified", "seated", "left", "canceled"]).parse(status)
          : undefined,
      ),
    };
  }

  @Post("waitlist")
  async createWaitlistEntry(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.floorService.createWaitlistEntry(
      await this.context(headers),
      waitlistSchema.parse(body),
    );
  }

  @Patch("waitlist/:entryId")
  async updateWaitlistEntry(
    @Headers() headers: HeaderRecord,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.floorService.updateWaitlistEntry(
      await this.context(headers),
      z.string().uuid().parse(entryId),
      waitlistUpdateSchema.parse(body),
    );
  }

  @Post("tables/:tableId/transfer")
  async transferTable(
    @Headers() headers: HeaderRecord,
    @Param("tableId") tableId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = z.object({ targetTableId: z.string().uuid() }).parse(body);
    return this.floorService.transferTable(
      await this.context(headers),
      z.string().uuid().parse(tableId),
      input.targetTableId,
    );
  }

  @Post("tables/:tableId/release")
  async releaseTable(
    @Headers() headers: HeaderRecord,
    @Param("tableId") tableId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    z.object({}).parse(body);
    return this.floorService.releaseTable(
      await this.context(headers),
      z.string().uuid().parse(tableId),
    );
  }

  private async context(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "pos:operate");
    return context;
  }
}
