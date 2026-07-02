import { Body, Controller, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { TenantsService } from "./tenants.service";

const createTenantSchema = z.object({
  name: z.string().min(2),
  ownerName: z.string().min(2),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8),
  document: z.string().optional(),
  planCode: z.string().optional(),
});

@Controller("tenants")
export class TenantsController {
  constructor(@Inject(TenantsService) private readonly tenantsService: TenantsService) {}

  @Post()
  async createTenant(@Body() body: unknown) {
    const input = createTenantSchema.parse(body);
    return this.tenantsService.createTenant(input);
  }
}
