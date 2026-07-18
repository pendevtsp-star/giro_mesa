import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { CustomersService } from "./customers.service";

const customerSchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  marketingOptIn: z.boolean().optional(),
});

@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(CustomersService) private readonly customersService: CustomersService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get()
  async list(@Headers() headers: HeaderRecord, @Query("search") search?: string) {
    const context = await this.context(headers, "pos:operate");
    return { data: await this.customersService.list(context, search) };
  }

  @Get(":customerId/history")
  async history(@Headers() headers: HeaderRecord, @Param("customerId") customerId: string) {
    const context = await this.context(headers, "pos:operate");
    return { data: await this.customersService.history(context, customerId) };
  }

  @Post()
  async create(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "catalog:manage");
    return this.customersService.create(context, customerSchema.parse(body));
  }

  @Patch(":customerId")
  async update(
    @Headers() headers: HeaderRecord,
    @Param("customerId") customerId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "catalog:manage");
    return this.customersService.update(context, customerId, customerSchema.partial().parse(body));
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
