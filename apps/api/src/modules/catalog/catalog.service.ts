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
import { activeOrderStatuses, calculateOrderTotal } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { enqueueClubWhiskyProductUpdated } from "../integrations/club-whisky-events";

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
  isAlcoholic: boolean;
  usesReturnablePackaging?: boolean | undefined;
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
  isAlcoholic?: boolean | undefined;
  usesReturnablePackaging?: boolean | undefined;
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

export type ModifierGroupInput = {
  productId: string;
  name: string;
  minChoices?: number | undefined;
  maxChoices?: number | undefined;
  isRequired?: boolean | undefined;
};
export type ModifierOptionInput = {
  name: string;
  priceDeltaCents?: number | undefined;
  costDeltaCents?: number | undefined;
  isAvailable?: boolean | undefined;
};

export type PublicQrOrderInput = {
  items: {
    productId: string;
    quantity: number;
    notes?: string | undefined;
    modifiers?: { optionId: string }[] | undefined;
  }[];
};

export type PublicQrActionInput = {
  message?: string | undefined;
};

export function readLegacyQrTenantSlug(env: NodeJS.ProcessEnv = process.env) {
  if (env.LEGACY_QR_ENABLED !== "true") return null;
  const slug = env.LEGACY_QR_TENANT_SLUG?.trim();
  return slug || null;
}

export function isLegacyQrAllowed(
  tenant: Pick<typeof tenants.$inferSelect, "isDemo" | "slug">,
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuredSlug = readLegacyQrTenantSlug(env);
  return Boolean(configuredSlug && tenant.isDemo && tenant.slug === configuredSlug);
}

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
        isAlcoholic: products.isAlcoholic,
        usesReturnablePackaging: products.usesReturnablePackaging,
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
    return this.database.db.transaction(async (tx) => {
      const [product] = await tx
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
          isAlcoholic: input.isAlcoholic,
          usesReturnablePackaging: input.usesReturnablePackaging ?? false,
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

      if (!product) {
        throw new Error("Failed to create product");
      }

      if (product.isClubEligible) {
        await enqueueClubWhiskyProductUpdated(tx, context, product, "created");
      }

      return product;
    });
  }

  async updateProduct(context: TenantContext, productId: string, input: UpdateProductInput) {
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ isClubEligible: products.isClubEligible })
        .from(products)
        .where(and(eq(products.tenantId, context.tenantId), eq(products.id, productId)))
        .limit(1);

      if (!existing) {
        throw new NotFoundException("Product not found");
      }

      const [product] = await tx
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
          ...(input.isAlcoholic !== undefined ? { isAlcoholic: input.isAlcoholic } : {}),
          ...(input.usesReturnablePackaging !== undefined
            ? { usesReturnablePackaging: input.usesReturnablePackaging }
            : {}),
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

      if (existing.isClubEligible || product.isClubEligible) {
        await enqueueClubWhiskyProductUpdated(tx, context, product, "updated");
      }

      return product;
    });
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
          isAlcoholic: products.isAlcoholic,
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

    const availableProducts = menuProducts.filter(
      (product) => product.isAvailable && product.channels.includes("qr"),
    );

    const productIds = availableProducts.map((p) => p.id);
    const modifierCounts =
      productIds.length > 0
        ? await this.database.db
            .select({
              productId: modifierGroups.productId,
              count: sql<number>`count(*)::int`,
            })
            .from(modifierGroups)
            .where(sql`${modifierGroups.productId} IN ${productIds}`)
            .groupBy(modifierGroups.productId)
        : [];

    const countByProduct = new Map(modifierCounts.map((r) => [r.productId, r.count]));

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        branding: this.readBranding(tenant.settings, tenant.name),
      },
      categories: menuCategories,
      products: availableProducts.map((product) => ({
        ...product,
        modifierGroupCount: countByProduct.get(product.id) ?? 0,
      })),
    };
  }

  async getPublicQrContext(tableCode: string) {
    const tenant = await this.resolveLegacyTenant();
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
    const tenant = await this.resolveLegacyTenant();
    return this.database.db.transaction(async (tx) => {
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.tenantId, tenant.id), eq(diningTables.code, tableCode)))
        .limit(1)
        .for("update");

      if (!table) {
        throw new NotFoundException("Table not found");
      }

      const productRows = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenant.id), eq(products.isActive, true)));
      const productById = new Map(productRows.map((product) => [product.id, product]));

      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenant.id),
            eq(orders.branchId, table.branchId),
            eq(orders.tableId, table.id),
            inArray(orders.status, [...activeOrderStatuses]),
          ),
        )
        .limit(1)
        .for("update");

      if (!order) {
        throw new BadRequestException("Table service is not active");
      }

      let subtotalCents = 0;
      const createdItems = [];

      const allModifierOptionIds = input.items.flatMap((item) =>
        (item.modifiers ?? []).map((m) => m.optionId),
      );
      const modifierOptionRows =
        allModifierOptionIds.length > 0
          ? await tx
              .select()
              .from(modifierOptions)
              .where(sql`${modifierOptions.id} IN ${allModifierOptionIds}`)
          : [];
      const modifierOptionById = new Map(modifierOptionRows.map((opt) => [opt.id, opt]));

      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product?.isAvailable || !product.channels.includes("qr")) {
          throw new NotFoundException("Product not found or unavailable");
        }

        let modifierDeltaCents = 0;
        const resolvedModifiers: { optionId: string }[] = [];
        for (const mod of item.modifiers ?? []) {
          const option = modifierOptionById.get(mod.optionId);
          if (option) {
            modifierDeltaCents += option.priceDeltaCents;
            resolvedModifiers.push({ optionId: mod.optionId });
          }
        }

        const unitPriceCents = product.priceCents + modifierDeltaCents;
        const total = calculateOrderTotal({
          lines: [{ quantity: item.quantity, unitPriceCents }],
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
            unitPriceCents,
            totalCents: total.totalCents,
            sourceChannel: "qr",
            notes: item.notes,
            modifiers: resolvedModifiers,
          })
          .returning();

        if (created) {
          createdItems.push(created);
        }
      }

      await tx
        .update(orders)
        .set({
          subtotalCents: order.subtotalCents + subtotalCents,
          totalCents:
            order.subtotalCents +
            subtotalCents -
            order.discountCents +
            order.serviceChargeCents +
            order.deliveryFeeCents,
          version: sql`${orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, tenant.id), eq(orders.id, order.id)));
      await tx
        .update(diningTables)
        .set({
          status: "waiting_order",
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(diningTables.tenantId, tenant.id),
            eq(diningTables.branchId, table.branchId),
            eq(diningTables.id, table.id),
          ),
        );

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        branchId: table.branchId,
        requestId: `qr-${order.id}`,
        action: "qr.order_created",
        entityType: "order",
        entityId: order.id,
        metadata: { tableCode, itemCount: createdItems.length, attachedToActiveOrder: true },
      });

      return { orderId: order.id, status: order.status, items: createdItems };
    });
  }

  async registerPublicQrAction(tableCode: string, action: string, input: PublicQrActionInput) {
    const tenant = await this.resolveLegacyTenant();
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

  async getPublicModifierGroups(productId: string) {
    const [product] = await this.database.db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.isActive, true)))
      .limit(1);

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const groups = await this.database.db
      .select({
        id: modifierGroups.id,
        name: modifierGroups.name,
        minChoices: modifierGroups.minChoices,
        maxChoices: modifierGroups.maxChoices,
        isRequired: modifierGroups.isRequired,
        tenantId: modifierGroups.tenantId,
      })
      .from(modifierGroups)
      .where(eq(modifierGroups.productId, productId));

    const firstGroup = groups[0];
    if (!firstGroup) return [];
    const tenantId = firstGroup.tenantId;
    const groupIds = groups.map((g) => g.id);

    const availableOptions = await this.database.db
      .select({
        id: modifierOptions.id,
        groupId: modifierOptions.groupId,
        name: modifierOptions.name,
        priceDeltaCents: modifierOptions.priceDeltaCents,
      })
      .from(modifierOptions)
      .where(
        and(
          eq(modifierOptions.tenantId, tenantId),
          eq(modifierOptions.isAvailable, true),
          inArray(modifierOptions.groupId, groupIds),
        ),
      );

    const optionsByGroup = new Map<string, typeof availableOptions>();
    for (const opt of availableOptions) {
      const list = optionsByGroup.get(opt.groupId) ?? [];
      list.push(opt);
      optionsByGroup.set(opt.groupId, list);
    }

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      minChoices: group.minChoices,
      maxChoices: group.maxChoices,
      isRequired: group.isRequired,
      options: optionsByGroup.get(group.id) ?? [],
    }));
  }

  async countModifierGroupsByProduct(productId: string): Promise<number> {
    const [result] = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(modifierGroups)
      .where(eq(modifierGroups.productId, productId));
    return result?.count ?? 0;
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

  async createModifierGroup(context: TenantContext, input: ModifierGroupInput) {
    const [product] = await this.database.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.id, input.productId)))
      .limit(1);
    if (!product) throw new NotFoundException("Product not found");
    if ((input.maxChoices ?? 1) < (input.minChoices ?? 0))
      throw new Error("Maximum choices must be greater than minimum choices");
    const [group] = await this.database.db
      .insert(modifierGroups)
      .values({
        tenantId: context.tenantId,
        productId: product.id,
        name: input.name,
        minChoices: input.minChoices ?? 0,
        maxChoices: input.maxChoices ?? 1,
        isRequired: input.isRequired ?? false,
      })
      .returning();
    if (!group) throw new Error("Failed to create modifier group");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "catalog.modifier_group_created",
      entityType: "modifier_group",
      entityId: group.id,
      metadata: { productId: product.id },
    });
    return group;
  }

  async createModifierOption(context: TenantContext, groupId: string, input: ModifierOptionInput) {
    const [group] = await this.database.db
      .select()
      .from(modifierGroups)
      .where(and(eq(modifierGroups.tenantId, context.tenantId), eq(modifierGroups.id, groupId)))
      .limit(1);
    if (!group) throw new NotFoundException("Modifier group not found");
    const [option] = await this.database.db
      .insert(modifierOptions)
      .values({
        tenantId: context.tenantId,
        groupId: group.id,
        name: input.name,
        priceDeltaCents: input.priceDeltaCents ?? 0,
        costDeltaCents: input.costDeltaCents ?? 0,
        isAvailable: input.isAvailable ?? true,
      })
      .returning();
    if (!option) throw new Error("Failed to create modifier option");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "catalog.modifier_option_created",
      entityType: "modifier_option",
      entityId: option.id,
      metadata: { groupId: group.id },
    });
    return option;
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

  private async resolveLegacyTenant() {
    const slug = readLegacyQrTenantSlug();
    if (!slug) {
      throw new NotFoundException("Legacy QR links are disabled");
    }
    const tenant = await this.resolveTenant(slug);
    this.assertLegacyQrAllowed(tenant);
    return tenant;
  }

  private assertLegacyQrAllowed(tenant: typeof tenants.$inferSelect) {
    if (!isLegacyQrAllowed(tenant)) {
      throw new NotFoundException("Legacy QR links are disabled for this tenant");
    }
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
