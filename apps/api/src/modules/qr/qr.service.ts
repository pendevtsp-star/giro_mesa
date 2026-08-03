import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  categories,
  diningTables,
  guestExperienceConfigs,
  integrationAccounts,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  payments,
  products,
  publicRequestIdempotency,
  qrBranchSettings,
  serviceRequests,
  tenants,
} from "@giromesa/db";
import type {
  GuestExperienceConfig,
  GuestExperienceRevision,
  PublicOrderTimeline,
  QrBranchSettings,
  QrCapability,
  QrFontPreset,
  QrTemplate,
  TenantContext,
} from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { DatabaseService } from "../database/database.service";

type TokenPayload = { tenantId: string; branchId: string; tableId: string; version: number };
type PublicOrderInput = {
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | undefined;
    modifiers?: Array<{ optionId: string }> | undefined;
  }>;
};
type PublicServiceRequestInput = {
  type: "call_waiter" | "request_pre_bill" | "need_help";
  message?: string | undefined;
};
type GuestExperienceDraftInput = {
  [key in Exclude<keyof GuestExperienceConfig, "branchId">]?:
    | GuestExperienceConfig[key]
    | undefined;
} & {
  scheduledAt?: Date | null | undefined;
};

export type PublicPartnerAttribution = {
  product: "doseclub";
  label: "DoseClub, por GiroMesa";
  href: "https://doseclube.giromesa.com.br/?utm_source=giromesa_qr&utm_medium=qr&utm_campaign=organic_attribution";
};

/**
 * Resolve the optional commercial signature from server-owned integration state.
 * Public QR clients never provide any of these values.
 */
export function resolvePublicPartnerAttribution(input: {
  accountStatus?: string | null;
  configuredBranchId?: string | null;
  branchId: string;
  marketingEnabled?: boolean;
}): PublicPartnerAttribution | undefined {
  if (
    input.marketingEnabled === false ||
    input.accountStatus !== "active" ||
    input.configuredBranchId !== input.branchId
  ) {
    return undefined;
  }

  return {
    product: "doseclub",
    label: "DoseClub, por GiroMesa",
    href: "https://doseclube.giromesa.com.br/?utm_source=giromesa_qr&utm_medium=qr&utm_campaign=organic_attribution",
  };
}

export function sanitizeQrFontPreset(value: unknown): QrFontPreset | undefined {
  return value === "system" || value === "serif" || value === "display" ? value : undefined;
}

const defaultCapabilities: QrCapability[] = [
  "menu",
  "order",
  "track_preparation",
  "view_tab",
  "call_waiter",
  "request_pre_bill",
];
const activeOrderStatuses = [
  "draft",
  "opened",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "served",
  "waiting_payment",
  "partially_paid",
] as const;

@Injectable()
export class QrService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getSettings(context: TenantContext): Promise<QrBranchSettings> {
    const branchId = requireBranch(context);
    const [settings] = await this.database.db
      .select()
      .from(qrBranchSettings)
      .where(
        and(
          eq(qrBranchSettings.tenantId, context.tenantId),
          eq(qrBranchSettings.branchId, branchId),
        ),
      )
      .limit(1);
    return settings ? mapSettings(settings) : defaultSettings(branchId);
  }

  async updateSettings(
    context: TenantContext,
    input: {
      capabilities?: QrCapability[] | undefined;
      reviewBeforeKds?: boolean | undefined;
      template?: QrTemplate | undefined;
      primaryColor?: string | undefined;
      instruction?: string | undefined;
      showLogo?: boolean | undefined;
    },
  ) {
    const branchId = requireBranch(context);
    const [settings] = await this.database.db
      .insert(qrBranchSettings)
      .values({
        tenantId: context.tenantId,
        branchId,
        ...input,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: qrBranchSettings.branchId,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    await this.audit(context, "qr.settings_updated", "branch", branchId, input);
    return settings ? mapSettings(settings) : defaultSettings(branchId);
  }

  async getExperience(context: TenantContext) {
    const branchId = requireBranch(context);
    await this.activateScheduledExperience(context.tenantId, branchId);
    const rows = await this.database.db
      .select()
      .from(guestExperienceConfigs)
      .where(
        and(
          eq(guestExperienceConfigs.tenantId, context.tenantId),
          eq(guestExperienceConfigs.branchId, branchId),
        ),
      )
      .orderBy(desc(guestExperienceConfigs.version));
    const draft = rows.find((row) => row.status === "draft");
    const published = rows.find((row) => row.status === "published");
    return {
      draft: draft ? mapExperienceRevision(draft) : null,
      published: published ? mapExperienceRevision(published) : null,
      history: rows.slice(0, 12).map(mapExperienceRevision),
    };
  }

  async createExperienceDraft(
    context: TenantContext,
    input: GuestExperienceDraftInput,
  ): Promise<GuestExperienceRevision> {
    const branchId = requireBranch(context);
    const { scheduledAt, ...configInput } = input;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("Scheduled publication must be in the future");
    }
    const current = await this.settingsForBranch(context.tenantId, branchId);
    const latest = await this.database.db
      .select({ version: guestExperienceConfigs.version })
      .from(guestExperienceConfigs)
      .where(
        and(
          eq(guestExperienceConfigs.tenantId, context.tenantId),
          eq(guestExperienceConfigs.branchId, branchId),
        ),
      )
      .orderBy(desc(guestExperienceConfigs.version))
      .limit(1);
    const [draft] = await this.database.db
      .insert(guestExperienceConfigs)
      .values({
        tenantId: context.tenantId,
        branchId,
        version: (latest[0]?.version ?? 0) + 1,
        status: "draft",
        config: { ...current, ...configInput, branchId },
        scheduledAt: scheduledAt ?? null,
        createdByUserId: context.userId ?? null,
      })
      .returning();
    if (!draft) throw new BadRequestException("Unable to create QR experience draft");
    await this.audit(context, "qr.experience_draft_created", "branch", branchId, {
      revisionId: draft.id,
      version: draft.version,
    });
    return mapExperienceRevision(draft);
  }

  async scheduleExperience(context: TenantContext, revisionId: string, scheduledAt: Date) {
    const branchId = requireBranch(context);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("Scheduled publication must be in the future");
    }
    const [target] = await this.database.db
      .select({ status: guestExperienceConfigs.status })
      .from(guestExperienceConfigs)
      .where(
        and(
          eq(guestExperienceConfigs.id, revisionId),
          eq(guestExperienceConfigs.tenantId, context.tenantId),
          eq(guestExperienceConfigs.branchId, branchId),
        ),
      )
      .limit(1);
    if (!target) throw new NotFoundException("QR experience revision not found");
    if (target.status !== "draft") {
      throw new BadRequestException("Only a draft can be scheduled");
    }
    const [scheduled] = await this.database.db
      .update(guestExperienceConfigs)
      .set({ scheduledAt, updatedAt: new Date() })
      .where(
        and(
          eq(guestExperienceConfigs.id, revisionId),
          eq(guestExperienceConfigs.tenantId, context.tenantId),
          eq(guestExperienceConfigs.branchId, branchId),
          eq(guestExperienceConfigs.status, "draft"),
        ),
      )
      .returning();
    if (!scheduled) throw new NotFoundException("QR experience draft not found");
    await this.audit(context, "qr.experience_scheduled", "branch", branchId, {
      revisionId: scheduled.id,
      version: scheduled.version,
      scheduledAt: scheduled.scheduledAt?.toISOString() ?? null,
    });
    return mapExperienceRevision(scheduled);
  }

  async publishExperience(context: TenantContext, revisionId: string) {
    const branchId = requireBranch(context);
    const result = await this.database.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(guestExperienceConfigs)
        .where(
          and(
            eq(guestExperienceConfigs.id, revisionId),
            eq(guestExperienceConfigs.tenantId, context.tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
          ),
        )
        .limit(1);
      if (!target) throw new NotFoundException("QR experience revision not found");
      await tx
        .update(guestExperienceConfigs)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, context.tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "published"),
          ),
        );
      const [published] = await tx
        .update(guestExperienceConfigs)
        .set({
          status: "published",
          scheduledAt: null,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(guestExperienceConfigs.id, target.id))
        .returning();
      return published ?? target;
    });
    await this.audit(context, "qr.experience_published", "branch", branchId, {
      revisionId: result.id,
      version: result.version,
    });
    return mapExperienceRevision(result);
  }

  async rollbackExperience(context: TenantContext, revisionId: string) {
    const branchId = requireBranch(context);
    const result = await this.database.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(guestExperienceConfigs)
        .where(
          and(
            eq(guestExperienceConfigs.id, revisionId),
            eq(guestExperienceConfigs.tenantId, context.tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
          ),
        )
        .limit(1);
      if (!target) throw new NotFoundException("QR experience revision not found");
      if (target.status === "draft") {
        throw new BadRequestException("Publish the draft before using it as a rollback target");
      }

      const [latest] = await tx
        .select({ version: guestExperienceConfigs.version })
        .from(guestExperienceConfigs)
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, context.tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
          ),
        )
        .orderBy(desc(guestExperienceConfigs.version))
        .limit(1);
      await tx
        .update(guestExperienceConfigs)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, context.tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "published"),
          ),
        );
      const [rollback] = await tx
        .insert(guestExperienceConfigs)
        .values({
          tenantId: context.tenantId,
          branchId,
          version: (latest?.version ?? 0) + 1,
          status: "published",
          config: target.config,
          publishedAt: new Date(),
          createdByUserId: context.userId ?? null,
        })
        .returning();
      if (!rollback) throw new BadRequestException("Unable to restore QR experience revision");
      return { revision: rollback, targetVersion: target.version };
    });
    await this.audit(context, "qr.experience_rolled_back", "branch", branchId, {
      revisionId: result.revision.id,
      version: result.revision.version,
      targetRevisionId: revisionId,
      targetVersion: result.targetVersion,
    });
    return mapExperienceRevision(result.revision);
  }

  async listTables(context: TenantContext) {
    const branchId = requireBranch(context);
    const rows = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)))
      .orderBy(asc(diningTables.code));
    return Promise.all(
      rows.map(async (table) => {
        const token = this.sign({
          tenantId: table.tenantId,
          branchId: table.branchId,
          tableId: table.id,
          version: table.qrTokenVersion,
        });
        const tokenHash = sha256(token);
        if (table.qrTokenHash !== tokenHash) {
          await this.database.db
            .update(diningTables)
            .set({ qrTokenHash: tokenHash })
            .where(
              and(
                eq(diningTables.tenantId, context.tenantId),
                eq(diningTables.branchId, branchId),
                eq(diningTables.id, table.id),
                eq(diningTables.qrTokenVersion, table.qrTokenVersion),
              ),
            );
        }
        return {
          id: table.id,
          code: table.code,
          name: table.name,
          seats: table.seats,
          tableStatus: table.status,
          qrStatus: table.qrStatus,
          qrTokenVersion: table.qrTokenVersion,
          qrRotatedAt: table.qrRotatedAt?.toISOString() ?? null,
          publicUrl: this.publicUrl(token),
        };
      }),
    );
  }

  async rotate(context: TenantContext, tableId: string) {
    const branchId = requireBranch(context);
    const result = await this.database.db.transaction(async (tx) => {
      const [table] = await tx
        .update(diningTables)
        .set({
          qrTokenVersion: sql`${diningTables.qrTokenVersion} + 1`,
          qrStatus: "active",
          qrRotatedAt: new Date(),
          qrRotatedByUserId: context.userId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            eq(diningTables.id, tableId),
          ),
        )
        .returning();
      if (!table) {
        throw new NotFoundException("Table not found");
      }
      const token = this.sign({
        tenantId: table.tenantId,
        branchId: table.branchId,
        tableId: table.id,
        version: table.qrTokenVersion,
      });
      await tx
        .update(diningTables)
        .set({ qrTokenHash: sha256(token) })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, table.id)));
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "qr.table_rotated",
        entityType: "dining_table",
        entityId: table.id,
        metadata: { version: table.qrTokenVersion },
      });
      return {
        tableId: table.id,
        version: table.qrTokenVersion,
        publicUrl: this.publicUrl(token),
      };
    });
    return result;
  }

  async createArtwork(
    context: TenantContext,
    input: {
      tableIds: string[];
      format: "svg" | "png" | "pdf";
      size: "plate_10x15" | "sticker_8x8" | "a4";
    },
  ) {
    const branchId = requireBranch(context);
    const [settings, tables, tenantRows] = await Promise.all([
      this.settingsForBranch(context.tenantId, branchId),
      this.database.db
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            inArray(diningTables.id, input.tableIds),
          ),
        )
        .orderBy(asc(diningTables.code)),
      this.database.db
        .select({ name: tenants.name, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1),
    ]);
    if (tables.length !== new Set(input.tableIds).size) {
      throw new NotFoundException("One or more tables were not found");
    }
    const branding = readBranding(tenantRows[0]?.settings ?? {}, tenantRows[0]?.name ?? "GiroMesa");
    const items = await Promise.all(
      tables.map(async (table) => {
        const url = this.publicUrl(
          this.sign({
            tenantId: table.tenantId,
            branchId: table.branchId,
            tableId: table.id,
            version: table.qrTokenVersion,
          }),
        );
        const svg = await QRCode.toString(url, {
          type: "svg",
          errorCorrectionLevel: "H",
          margin: 4,
          color: { dark: "#071526", light: "#FFFFFF" },
        });
        const png =
          input.format === "png"
            ? await QRCode.toDataURL(url, {
                errorCorrectionLevel: "H",
                margin: 4,
                width: 1024,
                color: { dark: "#071526", light: "#FFFFFF" },
              })
            : null;
        return {
          tableId: table.id,
          tableCode: table.code,
          tableName: table.name,
          publicUrl: url,
          svg,
          png,
          fileName: `giromesa-${table.code.toLowerCase()}.${
            input.format === "png" ? "png" : input.format === "pdf" ? "pdf" : "svg"
          }`,
        };
      }),
    );
    await this.audit(context, "qr.artwork_generated", "branch", branchId, {
      count: items.length,
      format: input.format,
      size: input.size,
    });
    return {
      format: input.format,
      size: input.size,
      settings,
      branding,
      items,
      printHtml:
        input.format === "pdf" ? renderPrintHtml(items, settings, input.size, branding) : null,
    };
  }

  async getPublicContext(token: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const [menuCategories, menuProducts, doseClubAccount] = await Promise.all([
      this.database.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, resolved.tenant.id),
            or(
              eq(categories.branchId, resolved.table.branchId),
              sql`${categories.branchId} is null`,
            ),
            eq(categories.isActive, true),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      this.database.db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          categoryId: products.categoryId,
          priceCents: products.priceCents,
          imageUrl: products.imageUrl,
          channels: products.channels,
        })
        .from(products)
        .where(
          and(
            eq(products.tenantId, resolved.tenant.id),
            eq(products.isActive, true),
            eq(products.isAvailable, true),
          ),
        )
        .orderBy(asc(products.name)),
      this.database.db
        .select({
          status: integrationAccounts.status,
          configuredBranchId: sql<string | null>`${integrationAccounts.config}->>'branchId'`,
        })
        .from(integrationAccounts)
        .where(
          and(
            eq(integrationAccounts.tenantId, resolved.tenant.id),
            eq(integrationAccounts.provider, "club_whisky"),
            eq(integrationAccounts.status, "active"),
          ),
        )
        .limit(1),
    ]);
    const active = isTableActive(resolved.table.status);
    const partnerAttribution = resolvePublicPartnerAttribution({
      accountStatus: doseClubAccount[0]?.status ?? null,
      configuredBranchId: doseClubAccount[0]?.configuredBranchId ?? null,
      branchId: resolved.table.branchId,
      ...(settings.marketingEnabled !== undefined
        ? { marketingEnabled: settings.marketingEnabled }
        : {}),
    });
    return {
      tenant: {
        name: resolved.tenant.name,
        branding: readBranding(resolved.tenant.settings, resolved.tenant.name),
      },
      branchId: resolved.table.branchId,
      table: {
        id: resolved.table.id,
        code: resolved.table.code,
        name: resolved.table.name,
        status: resolved.table.status,
        active,
      },
      capabilities: settings.capabilities,
      reviewBeforeKds: settings.reviewBeforeKds,
      qrSettings: {
        template: settings.template,
        primaryColor: settings.primaryColor,
        instruction: settings.instruction,
        showLogo: settings.showLogo,
        fontPreset: settings.fontPreset ?? "system",
        ...(settings.welcomeMessage ? { welcomeMessage: settings.welcomeMessage } : {}),
        ...(settings.menuHeadline ? { menuHeadline: settings.menuHeadline } : {}),
        ...(settings.marketingEnabled !== undefined
          ? { marketingEnabled: settings.marketingEnabled }
          : {}),
      },
      ...(partnerAttribution ? { partnerAttribution } : {}),
      categories: menuCategories,
      products: menuProducts.filter((product) => product.channels.includes("qr")),
    };
  }

  async getPublicOrder(token: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    this.assertCapability(settings, "view_tab");
    this.assertActive(resolved.table.status);
    const [order] = await this.database.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, resolved.tenant.id),
          eq(orders.branchId, resolved.table.branchId),
          eq(orders.tableId, resolved.table.id),
          inArray(orders.status, activeOrderStatuses),
        ),
      )
      .orderBy(desc(orders.openedAt), desc(orders.createdAt))
      .limit(1);
    if (!order) {
      return { order: null };
    }
    const [items, paymentRows] = await Promise.all([
      this.database.db
        .select({
          name: orderItems.nameSnapshot,
          quantity: orderItems.quantity,
          unitPriceCents: orderItems.unitPriceCents,
          totalCents: orderItems.totalCents,
          status: orderItems.status,
        })
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, resolved.tenant.id), eq(orderItems.orderId, order.id)))
        .orderBy(asc(orderItems.createdAt)),
      this.database.db
        .select({
          amountCents: payments.amountCents,
          method: payments.method,
          status: payments.status,
        })
        .from(payments)
        .where(and(eq(payments.tenantId, resolved.tenant.id), eq(payments.orderId, order.id))),
    ]);
    const receivedCents = paymentRows
      .filter((payment) => payment.status === "confirmed")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const timeline = buildTimeline(order.status, order.openedAt, order.updatedAt, order.closedAt);
    return {
      order: {
        id: order.id,
        status: order.status,
        items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })),
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        serviceChargeCents: order.serviceChargeCents,
        totalCents: order.totalCents,
        receivedCents,
        remainingCents: Math.max(order.totalCents - receivedCents, 0),
        payments: paymentRows.map((payment) => ({
          amountCents: payment.amountCents,
          method: payment.method,
          status: payment.status,
        })),
        timeline,
      },
    };
  }

  async createPublicOrder(token: string, idempotencyKey: string, input: PublicOrderInput) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    this.assertCapability(settings, "order");
    this.assertActive(resolved.table.status);
    return this.database.db.transaction(async (tx) => {
      const replay = await reserveIdempotency(tx, {
        tenantId: resolved.tenant.id,
        tableId: resolved.table.id,
        action: "create_order",
        key: idempotencyKey,
        input,
      });
      if (replay) {
        return replay;
      }
      const productIds = [...new Set(input.items.map((item) => item.productId))];
      const productRows = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, resolved.tenant.id),
            inArray(products.id, productIds),
            eq(products.isActive, true),
            eq(products.isAvailable, true),
          ),
        );
      const productById = new Map(productRows.map((product) => [product.id, product]));
      let [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, resolved.tenant.id),
            eq(orders.branchId, resolved.table.branchId),
            eq(orders.tableId, resolved.table.id),
            inArray(orders.status, activeOrderStatuses),
          ),
        )
        .orderBy(desc(orders.openedAt), desc(orders.createdAt))
        .limit(1);
      if (!order) {
        [order] = await tx
          .insert(orders)
          .values({
            tenantId: resolved.tenant.id,
            branchId: resolved.table.branchId,
            tableId: resolved.table.id,
            channel: "qr",
            status: "opened",
            openedAt: new Date(),
          })
          .returning();
      }
      if (!order) {
        throw new ConflictException("Unable to open table order");
      }
      let addedSubtotalCents = 0;
      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product?.channels.includes("qr")) {
          throw new NotFoundException("Product not found or unavailable for QR");
        }
        const optionIds = [...new Set((item.modifiers ?? []).map((item) => item.optionId))];
        const options =
          optionIds.length === 0
            ? []
            : await tx
                .select({
                  id: modifierOptions.id,
                  priceDeltaCents: modifierOptions.priceDeltaCents,
                })
                .from(modifierOptions)
                .innerJoin(
                  modifierGroups,
                  and(
                    eq(modifierGroups.id, modifierOptions.groupId),
                    eq(modifierGroups.tenantId, resolved.tenant.id),
                    eq(modifierGroups.productId, product.id),
                  ),
                )
                .where(
                  and(
                    eq(modifierOptions.tenantId, resolved.tenant.id),
                    eq(modifierOptions.isAvailable, true),
                    inArray(modifierOptions.id, optionIds),
                  ),
                );
        if (options.length !== optionIds.length) {
          throw new BadRequestException("Invalid modifier selection");
        }
        const unitPriceCents =
          product.priceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
        const totalCents = unitPriceCents * item.quantity;
        addedSubtotalCents += totalCents;
        await tx.insert(orderItems).values({
          tenantId: resolved.tenant.id,
          orderId: order.id,
          productId: product.id,
          nameSnapshot: product.name,
          quantity: String(item.quantity),
          unitPriceCents,
          totalCents,
          notes: item.notes,
          modifiers: options.map((option) => ({ optionId: option.id })),
        });
      }
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          subtotalCents: sql`${orders.subtotalCents} + ${addedSubtotalCents}`,
          totalCents: sql`${orders.totalCents} + ${addedSubtotalCents}`,
          version: sql`${orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, resolved.tenant.id), eq(orders.id, order.id)))
        .returning();
      const response = {
        orderId: order.id,
        status: updatedOrder?.status ?? order.status,
        requiresReview: settings.reviewBeforeKds,
        itemCount: input.items.length,
      };
      await completeIdempotency(tx, resolved.table.id, "create_order", idempotencyKey, response);
      await tx.insert(auditLogs).values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        requestId: `qr-${sha256(idempotencyKey).slice(0, 16)}`,
        action: "qr.order_items_added",
        entityType: "order",
        entityId: order.id,
        metadata: { itemCount: input.items.length, requiresReview: settings.reviewBeforeKds },
      });
      return response;
    });
  }

  async createServiceRequest(
    token: string,
    idempotencyKey: string,
    input: PublicServiceRequestInput,
  ) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const capability = input.type === "request_pre_bill" ? "request_pre_bill" : "call_waiter";
    this.assertCapability(settings, capability);
    this.assertActive(resolved.table.status);
    return this.database.db.transaction(async (tx) => {
      const replay = await reserveIdempotency(tx, {
        tenantId: resolved.tenant.id,
        tableId: resolved.table.id,
        action: `service_request:${input.type}`,
        key: idempotencyKey,
        input,
      });
      if (replay) {
        return replay;
      }
      const recent = await tx
        .select({ id: serviceRequests.id })
        .from(serviceRequests)
        .where(
          and(
            eq(serviceRequests.tenantId, resolved.tenant.id),
            eq(serviceRequests.tableId, resolved.table.id),
            eq(serviceRequests.type, input.type),
            inArray(serviceRequests.status, ["pending", "acknowledged"]),
            gte(serviceRequests.createdAt, new Date(Date.now() - 60_000)),
          ),
        )
        .limit(1);
      if (recent[0]) {
        throw new ConflictException("A similar request is already being handled");
      }
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, resolved.tenant.id),
            eq(orders.tableId, resolved.table.id),
            inArray(orders.status, activeOrderStatuses),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);
      const [request] = await tx
        .insert(serviceRequests)
        .values({
          tenantId: resolved.tenant.id,
          branchId: resolved.table.branchId,
          tableId: resolved.table.id,
          orderId: order?.id,
          type: input.type,
          message: input.message,
          requesterKeyHash: sha256(idempotencyKey),
        })
        .returning();
      if (!request) {
        throw new ConflictException("Unable to create service request");
      }
      const response = { id: request.id, status: request.status, type: request.type };
      await completeIdempotency(
        tx,
        resolved.table.id,
        `service_request:${input.type}`,
        idempotencyKey,
        response,
      );
      await tx.insert(auditLogs).values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        requestId: `qr-${sha256(idempotencyKey).slice(0, 16)}`,
        action: `qr.${input.type}`,
        entityType: "service_request",
        entityId: request.id,
        metadata: { tableCode: resolved.table.code },
      });
      return response;
    });
  }

  async getPublicServiceRequest(token: string, requestId: string) {
    const resolved = await this.resolveToken(token);
    this.assertActive(resolved.table.status);
    const [request] = await this.database.db
      .select({
        id: serviceRequests.id,
        type: serviceRequests.type,
        status: serviceRequests.status,
        message: serviceRequests.message,
        acknowledgedAt: serviceRequests.acknowledgedAt,
        resolvedAt: serviceRequests.resolvedAt,
        createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.tenantId, resolved.tenant.id),
          eq(serviceRequests.branchId, resolved.table.branchId),
          eq(serviceRequests.tableId, resolved.table.id),
          eq(serviceRequests.id, requestId),
        ),
      )
      .limit(1);
    if (!request) throw new NotFoundException("Service request not found");
    return request;
  }

  async listServiceRequests(
    context: TenantContext,
    status?: "pending" | "acknowledged" | "resolved" | "canceled",
  ) {
    const conditions = [
      eq(serviceRequests.tenantId, context.tenantId),
      eq(serviceRequests.branchId, requireBranch(context)),
    ];
    if (status) {
      conditions.push(eq(serviceRequests.status, status));
    }
    return this.database.db
      .select({
        id: serviceRequests.id,
        tableId: serviceRequests.tableId,
        tableCode: diningTables.code,
        tableName: diningTables.name,
        orderId: serviceRequests.orderId,
        type: serviceRequests.type,
        status: serviceRequests.status,
        message: serviceRequests.message,
        acknowledgedAt: serviceRequests.acknowledgedAt,
        resolvedAt: serviceRequests.resolvedAt,
        createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.tenantId, context.tenantId),
          eq(diningTables.id, serviceRequests.tableId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async acknowledge(context: TenantContext, id: string) {
    return this.transitionRequest(context, id, "acknowledged");
  }

  async resolve(context: TenantContext, id: string) {
    return this.transitionRequest(context, id, "resolved");
  }

  private async transitionRequest(
    context: TenantContext,
    id: string,
    status: "acknowledged" | "resolved",
  ) {
    if (!context.userId) {
      throw new ForbiddenException("Operational user is required");
    }
    const branchId = requireBranch(context);
    const now = new Date();
    const [request] = await this.database.db
      .update(serviceRequests)
      .set(
        status === "acknowledged"
          ? { status, acknowledgedAt: now, acknowledgedByUserId: context.userId, updatedAt: now }
          : { status, resolvedAt: now, resolvedByUserId: context.userId, updatedAt: now },
      )
      .where(
        and(
          eq(serviceRequests.tenantId, context.tenantId),
          eq(serviceRequests.branchId, branchId),
          eq(serviceRequests.id, id),
          status === "acknowledged"
            ? eq(serviceRequests.status, "pending")
            : inArray(serviceRequests.status, ["pending", "acknowledged"]),
        ),
      )
      .returning();
    if (!request) {
      throw new ConflictException("Request not found or already transitioned");
    }
    await this.audit(context, `qr.service_request_${status}`, "service_request", request.id, {
      tableId: request.tableId,
    });
    return request;
  }

  private async resolveToken(token: string) {
    const payload = this.verify(token);
    const [row] = await this.database.db
      .select({ table: diningTables, tenant: tenants })
      .from(diningTables)
      .innerJoin(tenants, eq(tenants.id, diningTables.tenantId))
      .where(
        and(
          eq(diningTables.id, payload.tableId),
          eq(diningTables.tenantId, payload.tenantId),
          eq(diningTables.branchId, payload.branchId),
          eq(diningTables.qrTokenVersion, payload.version),
          eq(diningTables.qrStatus, "active"),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException("QR code is invalid or has been rotated");
    }
    return row;
  }

  private sign(payload: TokenPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", loadEnv().QR_SIGNING_SECRET)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string): TokenPayload {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) {
      throw new NotFoundException("Invalid QR code");
    }
    const expected = createHmac("sha256", loadEnv().QR_SIGNING_SECRET).update(encoded).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, "base64url");
    } catch {
      throw new NotFoundException("Invalid QR code");
    }
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new NotFoundException("Invalid QR code");
    }
    try {
      const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
      if (
        !value.tenantId ||
        !value.branchId ||
        !value.tableId ||
        !Number.isInteger(value.version) ||
        value.version < 1
      ) {
        throw new Error("invalid");
      }
      return value;
    } catch {
      throw new NotFoundException("Invalid QR code");
    }
  }

  private async settingsForBranch(tenantId: string, branchId: string) {
    await this.activateScheduledExperience(tenantId, branchId);
    const [settings] = await this.database.db
      .select()
      .from(qrBranchSettings)
      .where(and(eq(qrBranchSettings.tenantId, tenantId), eq(qrBranchSettings.branchId, branchId)))
      .limit(1);
    const base = settings ? mapSettings(settings) : defaultSettings(branchId);
    const [published] = await this.database.db
      .select({ config: guestExperienceConfigs.config })
      .from(guestExperienceConfigs)
      .where(
        and(
          eq(guestExperienceConfigs.tenantId, tenantId),
          eq(guestExperienceConfigs.branchId, branchId),
          eq(guestExperienceConfigs.status, "published"),
        ),
      )
      .orderBy(desc(guestExperienceConfigs.version))
      .limit(1);
    return published ? mergeExperienceSettings(base, published.config) : base;
  }

  private async activateScheduledExperience(tenantId: string, branchId: string) {
    const now = new Date();
    const activated = await this.database.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(guestExperienceConfigs)
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "draft"),
            lte(guestExperienceConfigs.scheduledAt, now),
          ),
        )
        .orderBy(desc(guestExperienceConfigs.version))
        .limit(1);
      if (!candidate) return null;
      await tx
        .update(guestExperienceConfigs)
        .set({ status: "archived", updatedAt: now })
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "published"),
          ),
        );
      await tx
        .update(guestExperienceConfigs)
        .set({ status: "archived", updatedAt: now })
        .where(
          and(
            eq(guestExperienceConfigs.tenantId, tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "draft"),
            lte(guestExperienceConfigs.scheduledAt, now),
            ne(guestExperienceConfigs.id, candidate.id),
          ),
        );
      const [published] = await tx
        .update(guestExperienceConfigs)
        .set({ status: "published", scheduledAt: null, publishedAt: now, updatedAt: now })
        .where(
          and(
            eq(guestExperienceConfigs.id, candidate.id),
            eq(guestExperienceConfigs.tenantId, tenantId),
            eq(guestExperienceConfigs.branchId, branchId),
            eq(guestExperienceConfigs.status, "draft"),
            lte(guestExperienceConfigs.scheduledAt, now),
          ),
        )
        .returning();
      return published ?? null;
    });
    if (activated) {
      await this.audit(
        {
          tenantId,
          branchId,
          requestId: "qr-scheduled-activation",
          permissions: [],
        },
        "qr.experience_schedule_activated",
        "branch",
        branchId,
        { revisionId: activated.id, version: activated.version },
      );
    }
  }

  private assertCapability(settings: QrBranchSettings, capability: QrCapability) {
    if (!settings.capabilities.includes(capability)) {
      throw new ForbiddenException("This QR capability is disabled for the branch");
    }
  }

  private assertActive(status: typeof diningTables.$inferSelect.status) {
    if (!isTableActive(status)) {
      throw new ConflictException("Table service must be activated by the team first");
    }
  }

  private publicUrl(token: string) {
    return `${loadEnv().PUBLIC_APP_URL.replace(/\/$/, "")}/q/${encodeURIComponent(token)}`;
  }

  private async audit(
    context: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    metadata: unknown,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType,
      entityId,
      metadata: metadata as Record<string, unknown>,
    });
  }
}

function requireBranch(context: TenantContext) {
  if (!context.branchId) {
    throw new BadRequestException("Active branch is required");
  }
  return context.branchId;
}

function isQrTemplate(value: unknown): value is QrTemplate {
  return [
    "classic",
    "minimal",
    "premium",
    "gastronomia",
    "bar_noturno",
    "cafe",
    "doseclub",
  ].includes(value as QrTemplate);
}

function defaultSettings(branchId: string): QrBranchSettings {
  return {
    branchId,
    capabilities: defaultCapabilities,
    reviewBeforeKds: false,
    template: "classic",
    primaryColor: "#FFCC00",
    instruction: "Aponte a câmera para acessar o cardápio",
    showLogo: true,
    fontPreset: "system",
  };
}

function mergeExperienceSettings(
  base: QrBranchSettings,
  config: Record<string, unknown>,
): QrBranchSettings {
  const capabilities = Array.isArray(config.capabilities)
    ? config.capabilities.filter((value): value is QrCapability =>
        defaultCapabilities.includes(value as QrCapability),
      )
    : base.capabilities;
  const fontPreset = sanitizeQrFontPreset(config.fontPreset);
  return {
    ...base,
    ...(typeof config.reviewBeforeKds === "boolean"
      ? { reviewBeforeKds: config.reviewBeforeKds }
      : {}),
    ...(isQrTemplate(config.template) ? { template: config.template } : {}),
    ...(typeof config.primaryColor === "string" && /^#[0-9a-f]{6}$/i.test(config.primaryColor)
      ? { primaryColor: config.primaryColor }
      : {}),
    ...(typeof config.instruction === "string" ? { instruction: config.instruction } : {}),
    ...(typeof config.showLogo === "boolean" ? { showLogo: config.showLogo } : {}),
    ...(fontPreset ? { fontPreset } : {}),
    ...(typeof config.welcomeMessage === "string" && config.welcomeMessage.trim()
      ? { welcomeMessage: config.welcomeMessage.trim() }
      : {}),
    ...(typeof config.menuHeadline === "string" && config.menuHeadline.trim()
      ? { menuHeadline: config.menuHeadline.trim() }
      : {}),
    ...(typeof config.marketingEnabled === "boolean"
      ? { marketingEnabled: config.marketingEnabled }
      : {}),
    ...(capabilities.length ? { capabilities } : {}),
  };
}

function mapExperienceRevision(
  row: typeof guestExperienceConfigs.$inferSelect,
): GuestExperienceRevision {
  const branchId = row.branchId;
  return {
    id: row.id,
    branchId,
    version: row.version,
    status: row.status,
    config: {
      ...mergeExperienceSettings(defaultSettings(branchId), row.config),
      ...(typeof row.config.welcomeMessage === "string"
        ? { welcomeMessage: row.config.welcomeMessage }
        : {}),
      ...(typeof row.config.menuHeadline === "string"
        ? { menuHeadline: row.config.menuHeadline }
        : {}),
      ...(typeof row.config.marketingEnabled === "boolean"
        ? { marketingEnabled: row.config.marketingEnabled }
        : {}),
    },
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSettings(row: typeof qrBranchSettings.$inferSelect): QrBranchSettings {
  return {
    branchId: row.branchId,
    capabilities: row.capabilities,
    reviewBeforeKds: row.reviewBeforeKds,
    template: isQrTemplate(row.template) ? row.template : "classic",
    primaryColor: row.primaryColor,
    instruction: row.instruction,
    showLogo: row.showLogo,
  };
}

function isTableActive(status: typeof diningTables.$inferSelect.status) {
  return !["free", "reserved", "blocked"].includes(status);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function reserveIdempotency(
  tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  input: {
    tenantId: string;
    tableId: string;
    action: string;
    key: string;
    input: unknown;
  },
) {
  const keyHash = sha256(input.key);
  const payloadHash = sha256(JSON.stringify(input.input));
  const [reserved] = await tx
    .insert(publicRequestIdempotency)
    .values({
      tenantId: input.tenantId,
      tableId: input.tableId,
      action: input.action,
      idempotencyKeyHash: keyHash,
      payloadHash,
    })
    .onConflictDoNothing()
    .returning({ id: publicRequestIdempotency.id });
  if (reserved) {
    return null;
  }
  const [existing] = await tx
    .select()
    .from(publicRequestIdempotency)
    .where(
      and(
        eq(publicRequestIdempotency.tableId, input.tableId),
        eq(publicRequestIdempotency.action, input.action),
        eq(publicRequestIdempotency.idempotencyKeyHash, keyHash),
      ),
    )
    .limit(1);
  if (!existing || existing.payloadHash !== payloadHash) {
    throw new ConflictException("Idempotency key was already used with a different payload");
  }
  if (!existing.response) {
    throw new ConflictException("Request with this idempotency key is still being processed");
  }
  return existing.response;
}

async function completeIdempotency(
  tx: Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0],
  tableId: string,
  action: string,
  key: string,
  response: Record<string, unknown>,
) {
  await tx
    .update(publicRequestIdempotency)
    .set({ response })
    .where(
      and(
        eq(publicRequestIdempotency.tableId, tableId),
        eq(publicRequestIdempotency.action, action),
        eq(publicRequestIdempotency.idempotencyKeyHash, sha256(key)),
      ),
    );
}

function readBranding(settings: Record<string, unknown>, tenantName: string) {
  const raw =
    settings.branding && typeof settings.branding === "object"
      ? (settings.branding as Record<string, unknown>)
      : {};
  return {
    displayName:
      typeof raw.displayName === "string" && raw.displayName.trim()
        ? raw.displayName.trim()
        : tenantName,
    logoUrl: typeof raw.logoUrl === "string" ? raw.logoUrl : null,
    themeMode: raw.themeMode === "dark" || raw.themeMode === "system" ? raw.themeMode : "light",
    accentPreset:
      raw.accentPreset === "blue" ||
      raw.accentPreset === "amber" ||
      raw.accentPreset === "rose" ||
      raw.accentPreset === "violet"
        ? raw.accentPreset
        : "emerald",
  };
}

function buildTimeline(
  status: (typeof orders.$inferSelect)["status"],
  openedAt: Date | null,
  updatedAt: Date,
  closedAt: Date | null,
): PublicOrderTimeline[] {
  const steps: Array<PublicOrderTimeline["key"]> = [
    "received",
    "sent_to_kitchen",
    "preparing",
    "ready",
    "served",
  ];
  const labels: Record<PublicOrderTimeline["key"], string> = {
    received: "Pedido recebido",
    sent_to_kitchen: "Enviado para produção",
    preparing: "Em preparo",
    ready: "Pronto para servir",
    served: "Entregue à mesa",
    canceled: "Pedido cancelado",
  };
  if (status === "canceled" || status === "refunded") {
    return [
      ...steps.map((key, index) => ({
        key,
        label: labels[key],
        state: index === 0 ? ("completed" as const) : ("pending" as const),
        at: index === 0 ? (openedAt?.toISOString() ?? null) : null,
      })),
      { key: "canceled", label: labels.canceled, state: "canceled", at: updatedAt.toISOString() },
    ];
  }
  const statusIndex =
    status === "draft" || status === "opened"
      ? 0
      : status === "sent_to_kitchen"
        ? 1
        : status === "preparing"
          ? 2
          : status === "ready"
            ? 3
            : status === "served" ||
                status === "waiting_payment" ||
                status === "partially_paid" ||
                status === "paid"
              ? 4
              : 0;
  return steps.map((key, index) => ({
    key,
    label: labels[key],
    state: index < statusIndex ? "completed" : index === statusIndex ? "active" : "pending",
    at:
      index === 0
        ? (openedAt?.toISOString() ?? null)
        : index === 4 && closedAt
          ? closedAt.toISOString()
          : index === statusIndex
            ? updatedAt.toISOString()
            : index < statusIndex
              ? updatedAt.toISOString()
              : null,
  }));
}

function renderPrintHtml(
  items: Array<{ tableCode: string; tableName: string; svg: string }>,
  settings: QrBranchSettings,
  size: "plate_10x15" | "sticker_8x8" | "a4",
  branding: { displayName: string; logoUrl: string | null },
) {
  const cards = items
    .map(
      (item) =>
        `<article><header>${branding.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" alt="" />` : ""}<strong>${escapeHtml(branding.displayName)}</strong></header><strong>${escapeHtml(item.tableName)}</strong><span>${escapeHtml(
          item.tableCode,
        )}</span>${item.svg}<p>${escapeHtml(settings.instruction)}</p></article>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:8mm}body{font-family:Arial,sans-serif;display:grid;grid-template-columns:${
    size === "a4" ? "repeat(3,1fr)" : "1fr"
  };gap:8mm}article{break-inside:avoid;border:2px solid ${escapeHtml(settings.primaryColor)};border-radius:12px;padding:8mm;text-align:center;color:#071526}header{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px}header img{width:24px;height:24px;object-fit:contain}strong,span{display:block}svg{width:100%;max-width:70mm;height:auto}p{font-size:12px}</style></head><body>${cards}</body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });
}
