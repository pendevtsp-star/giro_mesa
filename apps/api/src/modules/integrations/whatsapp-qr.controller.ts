import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import type { AuthService } from "../auth/auth.service";
import type { WhatsappQrService } from "./whatsapp-qr.service";

const configureSchema = z.object({
  branchId: z.string().uuid(),
  rotateKey: z.boolean().optional(),
});
const heartbeatSchema = z.object({
  version: z.string().min(1).max(80),
  status: z.enum(["connecting", "open", "closed", "logged_out"]),
  qr: z.string().max(4096).optional(),
  phone: z.string().max(40).optional(),
});

@Controller("integrations/whatsapp-qr")
export class WhatsappQrController {
  constructor(
    private readonly service: WhatsappQrService,
    private readonly auth: AuthService,
  ) {}

  @Get("config")
  async config(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.adminContext(headers);
    return { data: await this.service.status(context, branchId) };
  }

  @Post("configure")
  async configure(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.adminContext(headers);
    return { data: await this.service.configure(context, configureSchema.parse(body)) };
  }

  @Post("revoke/:branchId")
  async revoke(@Headers() headers: HeaderRecord, @Param("branchId") branchId: string) {
    const context = await this.adminContext(headers);
    return { data: await this.service.revoke(context, branchId) };
  }

  @Post("heartbeat")
  async heartbeat(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    const context = await this.service.resolveConnector(headers);
    return this.service.heartbeat(context, heartbeatSchema.parse(body ?? {}));
  }

  private async adminContext(headers: HeaderRecord) {
    const context = await this.auth.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return context;
  }
}
