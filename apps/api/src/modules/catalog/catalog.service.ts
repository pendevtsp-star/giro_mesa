import { categories, modifierGroups, modifierOptions, products } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export type CreateCategoryInput = {
  branchId?: string | undefined;
  name: string;
  sortOrder?: number | undefined;
};

export type CreateProductInput = {
  categoryId?: string | undefined;
  name: string;
  description?: string | undefined;
  priceCents: number;
  costCents?: number | undefined;
  channels?: string[] | undefined;
};

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listProducts(context: TenantContext) {
    return this.database.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        categoryId: products.categoryId,
        priceCents: products.priceCents,
        costCents: products.costCents,
        isAvailable: products.isAvailable,
        channels: products.channels,
      })
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.isActive, true)));
  }

  async createCategory(context: TenantContext, input: CreateCategoryInput) {
    const [category] = await this.database.db
      .insert(categories)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    return category;
  }

  async createProduct(context: TenantContext, input: CreateProductInput) {
    const [product] = await this.database.db
      .insert(products)
      .values({
        tenantId: context.tenantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        costCents: input.costCents ?? 0,
        channels: input.channels ?? ["pos", "qr"],
      })
      .returning();

    return product;
  }

  async listModifierGroups(context: TenantContext, productId: string) {
    const groups = await this.database.db
      .select()
      .from(modifierGroups)
      .where(
        and(eq(modifierGroups.tenantId, context.tenantId), eq(modifierGroups.productId, productId)),
      );

    const options = await this.database.db
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.tenantId, context.tenantId));

    return groups.map((group) => ({
      ...group,
      options: options.filter((option) => option.groupId === group.id),
    }));
  }
}
