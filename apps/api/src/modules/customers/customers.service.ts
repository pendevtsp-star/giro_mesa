import { auditLogs, customers, orders } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type CustomerInput = {
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  birthday?: string | undefined;
  marketingOptIn?: boolean | undefined;
};

@Injectable()
export class CustomersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(context: TenantContext, search?: string) {
    const where = [eq(customers.tenantId, context.tenantId)];
    if (search?.trim()) {
      const query = `%${search.trim()}%`;
      where.push(or(ilike(customers.name, query), ilike(customers.phone, query), ilike(customers.email, query))!);
    }
    return this.database.db.select().from(customers).where(and(...where)).orderBy(desc(customers.createdAt)).limit(100);
  }

  async create(context: TenantContext, input: CustomerInput) {
    const [customer] = await this.database.db.insert(customers).values({
      tenantId: context.tenantId,
      name: input.name,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.birthday ? { birthday: input.birthday } : {}),
      marketingOptIn: input.marketingOptIn ?? false,
      ...(input.marketingOptIn ? { lgpdConsentAt: new Date() } : {}),
    }).returning();
    if (!customer) throw new Error("Failed to create customer");
    await this.audit(context, "customer.created", customer.id, { marketingOptIn: customer.marketingOptIn });
    return customer;
  }

  async update(context: TenantContext, customerId: string, input: Partial<CustomerInput>) {
    const [customer] = await this.database.db.update(customers).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.birthday !== undefined ? { birthday: input.birthday || null } : {}),
      ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn, lgpdConsentAt: input.marketingOptIn ? new Date() : null } : {}),
      updatedAt: new Date(),
    }).where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, customerId))).returning();
    if (!customer) throw new NotFoundException("Customer not found");
    await this.audit(context, "customer.updated", customer.id, { fields: Object.keys(input) });
    return customer;
  }

  async history(context: TenantContext, customerId: string) {
    const [customer] = await this.database.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, customerId))).limit(1);
    if (!customer) throw new NotFoundException("Customer not found");
    return this.database.db.select({ id: orders.id, status: orders.status, channel: orders.channel, totalCents: orders.totalCents, openedAt: orders.openedAt, closedAt: orders.closedAt })
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.customerId, customerId)))
      .orderBy(desc(orders.createdAt)).limit(50);
  }

  private async audit(context: TenantContext, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.database.db.insert(auditLogs).values({ tenantId: context.tenantId, branchId: context.branchId, userId: context.userId, requestId: context.requestId, action, entityType: "customer", entityId, metadata });
  }
}
