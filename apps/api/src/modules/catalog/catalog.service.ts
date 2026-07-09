import {
  auditLogs,
  categories,
  diningTables,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  products,
  tenants,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { calculateOrderTotal } from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export type CreateCategoryInput = {
  branchId?: string | undefined;
  name: string;
  sortOrder?: number | undefined;
};

export type UpdateCategoryInput = {
  branchId?: string | undefined;
  name?: string | undefined;
  sortOrder?: number | undefined;
  isActive?: boolean | undefined;
};

export type CreateProductInput = {
  categoryId?: string | undefined;
  name: string;
  description?: string | undefined;
  sku?: string | undefined;
  priceCents: number;
  costCents?: number | undefined;
  imageUrl?: string | undefined;
  isAvailable?: boolean | undefined;
  isActive?: boolean | undefined;
  isClubEligible?: boolean | undefined;
  bottleVolumeMl?: number | undefined;
  defaultDoseMl?: number | undefined;
  spiritType?: string | undefined;
  channels?: string[] | undefined;
  fiscalNcm?: string | undefined;
  fiscalCfop?: string | undefined;
  fiscalCest?: string | undefined;
  fiscalOrigin?: string | undefined;
  fiscalCst?: string | undefined;
  fiscalCsosn?: string | undefined;
};

export type UpdateProductInput = {
  categoryId?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  sku?: string | undefined;
  priceCents?: number | undefined;
  costCents?: number | undefined;
  imageUrl?: string | undefined;
  isAvailable?: boolean | undefined;
  isActive?: boolean | undefined;
  isClubEligible?: boolean | undefined;
  bottleVolumeMl?: number | undefined;
  defaultDoseMl?: number | undefined;
  spiritType?: string | undefined;
  channels?: string[] | undefined;
  fiscalNcm?: string | undefined;
  fiscalCfop?: string | undefined;
  fiscalCest?: string | undefined;
  fiscalOrigin?: string | undefined;
  fiscalCst?: string | undefined;
  fiscalCsosn?: string | undefined;
};

export type PublicQrOrderInput = {
  tenantSlug: string;
  items: { productId: string; quantity: number; notes?: string | undefined }[];
};

export type PublicQrActionInput = {
  tenantSlug: string;
  message?: string | undefined;
};

type PublicBranding = {
  displayName: string;
  logoUrl: string | null;
  themeMode: "light" | "dark" | "system";
  accentPreset: "emerald" | "blue" | "amber" | "rose" | "violet";
};

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listCategories(context: TenantContext) {
    return this.database.db
      .select()
      .from(categories)
      .where(and(eq(categories.tenantId, context.tenantId), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async listProducts(context: TenantContext) {
    return this.database.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        sku: products.sku,
        categoryId: products.categoryId,
        priceCents: products.priceCents,
        costCents: products.costCents,
        imageUrl: products.imageUrl,
        isActive: products.isActive,
        isAvailable: products.isAvailable,
        isClubEligible: products.isClubEligible,
        bottleVolumeMl: products.bottleVolumeMl,
        defaultDoseMl: products.defaultDoseMl,
        spiritType: products.spiritType,
        fiscalNcm: products.fiscalNcm,
        fiscalCfop: products.fiscalCfop,
        fiscalCest: products.fiscalCest,
        fiscalOrigin: products.fiscalOrigin,
        fiscalCst: products.fiscalCst,
        fiscalCsosn: products.fiscalCsosn,
        channels: products.channels,
      })
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.isActive, true)))
      .orderBy(asc(products.name));
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

  async updateCategory(context: TenantContext, categoryId: string, input: UpdateCategoryInput) {
    const [category] = await this.database.db
      .update(categories)
      .set({
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(categories.tenantId, context.tenantId), eq(categories.id, categoryId)))
      .returning();

    if (!category) {
      throw new NotFoundException("Category not found");
    }

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
        sku: input.sku,
        priceCents: input.priceCents,
        costCents: input.costCents ?? 0,
        imageUrl: input.imageUrl,
        isAvailable: input.isAvailable ?? true,
        isClubEligible: input.isClubEligible ?? false,
        bottleVolumeMl: input.bottleVolumeMl,
        defaultDoseMl: input.defaultDoseMl ?? 50,
        spiritType: input.spiritType,
        channels: input.channels ?? ["pos", "qr"],
        fiscalNcm: input.fiscalNcm,
        fiscalCfop: input.fiscalCfop,
        fiscalCest: input.fiscalCest,
        fiscalOrigin: input.fiscalOrigin,
        fiscalCst: input.fiscalCst,
        fiscalCsosn: input.fiscalCsosn,
      })
      .returning();

    return product;
  }

  async updateProduct(context: TenantContext, productId: string, input: UpdateProductInput) {
    const [product] = await this.database.db
      .update(products)
      .set({
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        ...(input.isClubEligible !== undefined ? { isClubEligible: input.isClubEligible } : {}),
        ...(input.bottleVolumeMl !== undefined ? { bottleVolumeMl: input.bottleVolumeMl } : {}),
        ...(input.defaultDoseMl !== undefined ? { defaultDoseMl: input.defaultDoseMl } : {}),
        ...(input.spiritType !== undefined ? { spiritType: input.spiritType } : {}),
        ...(input.channels !== undefined ? { channels: input.channels } : {}),
        ...(input.fiscalNcm !== undefined ? { fiscalNcm: input.fiscalNcm } : {}),
        ...(input.fiscalCfop !== undefined ? { fiscalCfop: input.fiscalCfop } : {}),
        ...(input.fiscalCest !== undefined ? { fiscalCest: input.fiscalCest } : {}),
        ...(input.fiscalOrigin !== undefined ? { fiscalOrigin: input.fiscalOrigin } : {}),
        ...(input.fiscalCst !== undefined ? { fiscalCst: input.fiscalCst } : {}),
        ...(input.fiscalCsosn !== undefined ? { fiscalCsosn: input.fiscalCsosn } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(products.tenantId, context.tenantId), eq(products.id, productId)))
      .returning();

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  async getPublicMenu(tenantSlug: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const [menuCategories, menuProducts] = await Promise.all([
      this.database.db
        .select()
        .from(categories)
        .where(and(eq(categories.tenantId, tenant.id), eq(categories.isActive, true)))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      this.database.db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          categoryId: products.categoryId,
          priceCents: products.priceCents,
          imageUrl: products.imageUrl,
          isAvailable: products.isAvailable,
          channels: products.channels,
          isClubEligible: products.isClubEligible,
          bottleVolumeMl: products.bottleVolumeMl,
          defaultDoseMl: products.defaultDoseMl,
          spiritType: products.spiritType,
        })
        .from(products)
        .where(and(eq(products.tenantId, tenant.id), eq(products.isActive, true)))
        .orderBy(asc(products.name)),
    ]);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        branding: this.readBranding(tenant.settings, tenant.name),
      },
      categories: menuCategories,
      products: menuProducts.filter(
        (product) => product.isAvailable && product.channels.includes("qr"),
      ),
    };
  }

  async getPublicQrContext(tenantSlug: string, tableCode: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, tenant.id), eq(diningTables.code, tableCode)))
      .limit(1);

    if (!table) {
      throw new NotFoundException("Table not found");
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        branding: this.readBranding(tenant.settings, tenant.name),
      },
      table: {
        id: table.id,
        branchId: table.branchId,
        code: table.code,
        name: table.name,
        status: table.status,
      },
    };
  }

  async createPublicQrOrder(tableCode: string, input: PublicQrOrderInput) {
    return this.database.db.transaction(async (tx) => {
      const tenant = await this.resolveTenant(input.tenantSlug);
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.tenantId, tenant.id), eq(diningTables.code, tableCode)))
        .limit(1);

      if (!table) {
        throw new NotFoundException("Table not found");
      }

      const productRows = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenant.id), eq(products.isActive, true)));
      const productById = new Map(productRows.map((product) => [product.id, product]));

      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: tenant.id,
          branchId: table.branchId,
          tableId: table.id,
          channel: "qr",
          status: "opened",
          peopleCount: 1,
          openedAt: new Date(),
        })
        .returning();

      if (!order) {
        throw new Error("Failed to create QR order");
      }

      let subtotalCents = 0;
      const createdItems = [];
      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product?.isAvailable || !product.channels.includes("qr")) {
          throw new NotFoundException("Product not found or unavailable");
        }

        const total = calculateOrderTotal({
          lines: [{ quantity: item.quantity, unitPriceCents: product.priceCents }],
        });
        subtotalCents += total.totalCents;

        const [created] = await tx
          .insert(orderItems)
          .values({
            tenantId: tenant.id,
            orderId: order.id,
            productId: product.id,
            nameSnapshot: product.name,
            quantity: String(item.quantity),
            unitPriceCents: product.priceCents,
            totalCents: total.totalCents,
            notes: item.notes,
            modifiers: [],
          })
          .returning();

        if (created) {
          createdItems.push(created);
        }
      }

      await tx
        .update(orders)
        .set({ subtotalCents, totalCents: subtotalCents, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx
        .update(diningTables)
        .set({ status: "waiting_order", updatedAt: new Date() })
        .where(eq(diningTables.id, table.id));

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        branchId: table.branchId,
        requestId: `qr-${order.id}`,
        action: "qr.order_created",
        entityType: "order",
        entityId: order.id,
        metadata: { tableCode, itemCount: createdItems.length },
      });

      return { orderId: order.id, status: "opened", items: createdItems };
    });
  }

  async registerPublicQrAction(tableCode: string, action: string, input: PublicQrActionInput) {
    const tenant = await this.resolveTenant(input.tenantSlug);
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, tenant.id), eq(diningTables.code, tableCode)))
      .limit(1);

    if (!table) {
      throw new NotFoundException("Table not found");
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: tenant.id,
      branchId: table.branchId,
      requestId: `qr-${Date.now()}`,
      action,
      entityType: "dining_table",
      entityId: table.id,
      metadata: { tableCode, message: input.message },
    });

    return { ok: true, tableCode, action };
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

  private async resolveTenant(tenantSlug: string) {
    const [tenant] = await this.database.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    return tenant;
  }

  private readBranding(settings: Record<string, unknown>, tenantName: string): PublicBranding {
    const rawBranding =
      settings && typeof settings.branding === "object" && settings.branding !== null
        ? (settings.branding as Partial<PublicBranding>)
        : {};

    return {
      displayName:
        typeof rawBranding.displayName === "string" && rawBranding.displayName.trim().length > 0
          ? rawBranding.displayName.trim()
          : tenantName,
      logoUrl:
        typeof rawBranding.logoUrl === "string" && rawBranding.logoUrl ? rawBranding.logoUrl : null,
      themeMode:
        rawBranding.themeMode === "dark" || rawBranding.themeMode === "system"
          ? rawBranding.themeMode
          : "light",
      accentPreset:
        rawBranding.accentPreset === "blue" ||
        rawBranding.accentPreset === "amber" ||
        rawBranding.accentPreset === "rose" ||
        rawBranding.accentPreset === "violet"
          ? rawBranding.accentPreset
          : "emerald",
    };
  }
}
