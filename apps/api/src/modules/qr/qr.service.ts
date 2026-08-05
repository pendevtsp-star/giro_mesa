import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  categories,
  commercialAttributionDaily,
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
  qrGuestAccessRequests,
  qrGuestSessions,
  serviceRequests,
  tableServiceSessions,
  tableWaiterAssignments,
  tenants,
  users,
} from "@giromesa/db";
import type {
  GuestExperienceConfig,
  GuestExperienceRevision,
  PublicOrderTimeline,
  QrBranchSettings,
  QrCapability,
  QrFontPreset,
  QrLanguage,
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
  Optional,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { DatabaseService } from "../database/database.service";
import {
  type ConfirmedOperation,
  confirmOperation,
  reserveOperation,
} from "../pos/operation-receipts";
import { OrdersService } from "../pos/orders.service";

type TokenPayload = { tenantId: string; branchId: string; tableId: string; version: number };
type AgeConfirmationPayload = TokenPayload & {
  kind: "age_confirmation";
  expiresAt: number;
};
type PublicOrderInput = {
  guestLabel?: string | undefined;
  ageConfirmationToken?: string | undefined;
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | undefined;
    modifiers?: Array<{ optionId: string }> | undefined;
  }>;
};
type PublicOrderReceipt = {
  orderId: string;
  status: string;
  requiresReview: boolean;
  itemCount: number;
  dispatchStatus: "pending" | "review" | "sent" | "attention";
};
type PublicServiceRequestInput =
  | {
      type: "call_waiter" | "request_pre_bill" | "need_help";
      message?: string | undefined;
    }
  | {
      type: "split_intent";
      message?: string | undefined;
      split: { mode: "equal" | "by_item" | "custom"; people?: number | undefined };
    }
  | {
      type: "payment_preference";
      message?: string | undefined;
      payment: {
        method: "cash" | "pix" | "credit_card" | "debit_card" | "other";
        splitMode?: "single" | "equal" | "by_item" | "custom" | undefined;
      };
    };

type TableServiceActivationResult = {
  sessionId: string;
  code: string;
  expiresAt: string;
};
type GuestExperienceDraftInput = {
  [key in Exclude<keyof GuestExperienceConfig, "branchId">]?:
    | GuestExperienceConfig[key]
    | undefined;
} & {
  scheduledAt?: Date | null | undefined;
};

type PublicGuestSession = {
  id: string;
  tableServiceSessionId: string;
  orderId: string | null;
  expiresAt: Date;
  mode: "disabled" | "menu_only" | "waiter_assisted" | "self_service";
  tabVisibility: "shared" | "own_items";
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

export function sanitizeQrPersonalization(
  config: Record<string, unknown>,
): Pick<
  GuestExperienceConfig,
  "categoryLabels" | "recommendedProductIds" | "serviceRequestReasons"
> {
  const categoryLabels =
    config.categoryLabels &&
    typeof config.categoryLabels === "object" &&
    !Array.isArray(config.categoryLabels)
      ? Object.fromEntries(
          Object.entries(config.categoryLabels)
            .filter(
              ([id, label]) =>
                /^[0-9a-f-]{36}$/i.test(id) && typeof label === "string" && label.trim(),
            )
            .slice(0, 30)
            .map(([id, label]) => [id, (label as string).trim().slice(0, 80)]),
        )
      : undefined;
  const recommendedProductIds = Array.isArray(config.recommendedProductIds)
    ? [
        ...new Set(
          config.recommendedProductIds.filter(
            (value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
          ),
        ),
      ].slice(0, 12)
    : undefined;
  const serviceRequestReasons = Array.isArray(config.serviceRequestReasons)
    ? [
        ...new Set(
          config.serviceRequestReasons
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim().slice(0, 80))
            .filter(Boolean),
        ),
      ].slice(0, 8)
    : undefined;

  return {
    ...(categoryLabels ? { categoryLabels } : {}),
    ...(recommendedProductIds ? { recommendedProductIds } : {}),
    ...(serviceRequestReasons ? { serviceRequestReasons } : {}),
  };
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
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(OrdersService)
    private readonly ordersService?: OrdersService,
  ) {}

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
      mode?: QrBranchSettings["mode"] | undefined;
      presenceMethods?: QrBranchSettings["presenceMethods"] | undefined;
      tabVisibility?: QrBranchSettings["tabVisibility"] | undefined;
      presenceCodeTtlMinutes?: number | undefined;
      guestSessionTtlMinutes?: number | undefined;
      trustedNetworkCidrs?: string[] | undefined;
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
    if (input.mode === "disabled") {
      await this.revokeBranchServiceSessions(context, branchId, "qr_disabled");
    }
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

  async previewExperience(context: TenantContext, input: GuestExperienceDraftInput) {
    const branchId = requireBranch(context);
    const { scheduledAt: _scheduledAt, ...configInput } = input;
    const rawConfig = configInput as Record<string, unknown>;
    await this.assertPersonalizationScope(
      context.tenantId,
      branchId,
      sanitizeQrPersonalization(rawConfig),
    );
    const current = await this.settingsForBranch(context.tenantId, branchId, false);
    return {
      preview: true,
      persisted: false,
      branchId,
      config: mergeExperienceSettings(current, rawConfig),
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
    const rawConfig = configInput as Record<string, unknown>;
    await this.assertPersonalizationScope(
      context.tenantId,
      branchId,
      sanitizeQrPersonalization(rawConfig),
    );
    const nextConfig = mergeExperienceSettings(current, rawConfig);
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
        config: nextConfig,
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
      const revokedSessions = await tx
        .update(tableServiceSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: context.userId ?? null,
          revokeReason: "qr_rotated",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tableServiceSessions.tenantId, context.tenantId),
            eq(tableServiceSessions.tableId, table.id),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .returning({ id: tableServiceSessions.id });
      if (revokedSessions.length) {
        await tx
          .update(qrGuestSessions)
          .set({
            status: "revoked",
            revokedAt: new Date(),
            revokedByUserId: context.userId ?? null,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              qrGuestSessions.tableServiceSessionId,
              revokedSessions.map((session) => session.id),
            ),
          );
      }
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

  async getPublicContext(token: string, guestToken?: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    if (settings.mode === "disabled") {
      throw new ForbiddenException("O acesso por QR está desativado nesta filial");
    }
    const [menuCategories, menuProducts, doseClubAccount, serviceSession] = await Promise.all([
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
          isAlcoholic: products.isAlcoholic,
          spiritType: products.spiritType,
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
      this.database.db
        .select({
          id: tableServiceSessions.id,
          status: tableServiceSessions.status,
          mode: tableServiceSessions.mode,
          presenceMethods: tableServiceSessions.presenceMethods,
          presenceCodeExpiresAt: tableServiceSessions.presenceCodeExpiresAt,
        })
        .from(tableServiceSessions)
        .where(
          and(
            eq(tableServiceSessions.tenantId, resolved.tenant.id),
            eq(tableServiceSessions.tableId, resolved.table.id),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    const guest = guestToken
      ? await this.requireGuestSession(resolved, guestToken).catch(() => null)
      : null;
    const active = isTableActive(resolved.table.status);
    const categoryLabels = settings.categoryLabels ?? {};
    const recommendedProductIds = new Set(settings.recommendedProductIds ?? []);
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
      mode: settings.mode,
      service: {
        active: Boolean(serviceSession),
        presenceRequired: settings.mode !== "menu_only",
        presenceMethods: serviceSession?.presenceMethods ?? settings.presenceMethods,
        ...(serviceSession?.presenceCodeExpiresAt
          ? { codeExpiresAt: serviceSession.presenceCodeExpiresAt.toISOString() }
          : {}),
        guestValidated: Boolean(guest),
        ...(guest ? { guestExpiresAt: guest.expiresAt.toISOString() } : {}),
      },
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
        ...(settings.coverUrl !== undefined ? { coverUrl: settings.coverUrl } : {}),
        ...(settings.language ? { language: settings.language } : {}),
        ...(settings.highlights?.length ? { highlights: settings.highlights } : {}),
        ...(settings.campaignMessage ? { campaignMessage: settings.campaignMessage } : {}),
        ...(settings.houseInfo ? { houseInfo: settings.houseInfo } : {}),
        ...(settings.serviceRequestReasons?.length
          ? { serviceRequestReasons: settings.serviceRequestReasons }
          : {}),
      },
      ...(partnerAttribution ? { partnerAttribution } : {}),
      categories: menuCategories.map((category) => ({
        ...category,
        name: categoryLabels[category.id] ?? category.name,
      })),
      products: menuProducts
        .filter((product) => product.channels.includes("qr"))
        .map((product) => ({
          ...product,
          recommended: recommendedProductIds.has(product.id),
        })),
    };
  }

  async activateTableService(
    context: TenantContext,
    tableId: string,
    input: { idempotencyKey?: string | undefined; expectedTableVersion?: number | undefined } = {},
  ): Promise<ConfirmedOperation<TableServiceActivationResult>> {
    const branchId = requireBranch(context);
    const idempotencyKey = input.idempotencyKey ?? context.requestId;
    const settings = await this.settingsForBranch(context.tenantId, branchId);
    if (settings.mode === "disabled" || settings.mode === "menu_only") {
      throw new BadRequestException("Esta filial não permite ações de mesa por QR");
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + settings.presenceCodeTtlMinutes * 60_000);
    return this.database.db.transaction(async (tx) => {
      const reservation = await reserveOperation<ConfirmedOperation<TableServiceActivationResult>>(
        tx,
        {
          tenantId: context.tenantId,
          branchId,
          scope: "qr.table_service.activate",
          idempotencyKey,
          payload: {
            tableId,
            expectedTableVersion: input.expectedTableVersion ?? null,
          },
        },
      );
      if (reservation.replay) return reservation.replay;
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            eq(diningTables.id, tableId),
          ),
        )
        .limit(1);
      if (!table) throw new NotFoundException("Mesa não encontrada");
      if (
        input.expectedTableVersion !== undefined &&
        table.version !== input.expectedTableVersion
      ) {
        throw new ConflictException({
          error: "dining_table_version_conflict",
          currentVersion: table.version,
        });
      }
      this.assertActive(table.status);
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.branchId, branchId),
            eq(orders.tableId, tableId),
            inArray(orders.status, activeOrderStatuses),
          ),
        )
        .orderBy(desc(orders.openedAt), desc(orders.createdAt))
        .limit(1);
      if (!order) throw new ConflictException("Abra o atendimento da mesa antes de ativar o QR");
      const [existing] = await tx
        .select()
        .from(tableServiceSessions)
        .where(
          and(
            eq(tableServiceSessions.tenantId, context.tenantId),
            eq(tableServiceSessions.tableId, tableId),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .limit(1);
      let session: typeof tableServiceSessions.$inferSelect | undefined;
      if (existing) {
        await tx
          .update(qrGuestSessions)
          .set({
            status: "revoked",
            revokedAt: now,
            revokedByUserId: context.userId ?? null,
            updatedAt: now,
          })
          .where(
            and(
              eq(qrGuestSessions.tenantId, context.tenantId),
              eq(qrGuestSessions.tableServiceSessionId, existing.id),
              eq(qrGuestSessions.status, "active"),
            ),
          );
        [session] = await tx
          .update(tableServiceSessions)
          .set({
            orderId: order.id,
            mode: settings.mode,
            capabilities: settings.capabilities,
            presenceMethods: settings.presenceMethods,
            tabVisibility: settings.tabVisibility,
            guestSessionTtlMinutes: settings.guestSessionTtlMinutes,
            presenceCodeHash: this.presenceCodeDigest(code),
            presenceCodeExpiresAt: expiresAt,
            presenceCodeAttempts: 0,
            version: sql`${tableServiceSessions.version} + 1`,
            updatedAt: now,
          })
          .where(eq(tableServiceSessions.id, existing.id))
          .returning();
      } else {
        [session] = await tx
          .insert(tableServiceSessions)
          .values({
            tenantId: context.tenantId,
            branchId,
            tableId,
            orderId: order.id,
            mode: settings.mode,
            capabilities: settings.capabilities,
            presenceMethods: settings.presenceMethods,
            tabVisibility: settings.tabVisibility,
            guestSessionTtlMinutes: settings.guestSessionTtlMinutes,
            presenceCodeHash: this.presenceCodeDigest(code),
            presenceCodeExpiresAt: expiresAt,
            activatedByUserId: context.userId ?? null,
          })
          .returning();
      }
      if (!session) throw new ConflictException("Não foi possível ativar a mesa");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId ?? null,
        requestId: context.requestId,
        action: "qr.table_service_activated",
        entityType: "table_service_session",
        entityId: session.id,
        metadata: {
          tableId,
          sessionId: session.id,
          sessionVersion: session.version,
          mode: settings.mode,
          presenceMethods: settings.presenceMethods,
        },
      });
      return confirmOperation(tx, {
        reservationId: reservation.reservationId,
        scope: "qr.table_service.activate",
        idempotencyKey,
        aggregateType: "table_service_session",
        aggregateId: session.id,
        version: session.version,
        result: { sessionId: session.id, code, expiresAt: expiresAt.toISOString() },
        serverTime: now,
      });
    });
  }

  async revokeTableService(context: TenantContext, tableId: string, reason = "revoked_by_team") {
    const branchId = requireBranch(context);
    return this.database.db.transaction(async (tx) => {
      const sessions = await tx
        .update(tableServiceSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: context.userId ?? null,
          revokeReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tableServiceSessions.tenantId, context.tenantId),
            eq(tableServiceSessions.branchId, branchId),
            eq(tableServiceSessions.tableId, tableId),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .returning({ id: tableServiceSessions.id });
      if (!sessions.length) return { revoked: false };
      await tx
        .update(qrGuestSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: context.userId ?? null,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            qrGuestSessions.tableServiceSessionId,
            sessions.map((session) => session.id),
          ),
        );
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId ?? null,
        requestId: context.requestId,
        action: "qr.table_service_revoked",
        entityType: "dining_table",
        entityId: tableId,
        metadata: { reason, sessions: sessions.length },
      });
      return { revoked: true, sessions: sessions.length };
    });
  }

  async validatePresenceCode(token: string, code: string) {
    const resolved = await this.resolveToken(token);
    const [session] = await this.database.db
      .select()
      .from(tableServiceSessions)
      .where(
        and(
          eq(tableServiceSessions.tenantId, resolved.tenant.id),
          eq(tableServiceSessions.tableId, resolved.table.id),
          eq(tableServiceSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!session?.presenceMethods.includes("code")) {
      throw new ForbiddenException("Confirmação por código não está disponível para esta mesa");
    }
    const now = new Date();
    if (
      !session.presenceCodeHash ||
      !session.presenceCodeExpiresAt ||
      session.presenceCodeExpiresAt <= now ||
      session.presenceCodeAttempts >= 5
    ) {
      throw new ForbiddenException(
        "O código desta mesa expirou ou precisa ser renovado pela equipe",
      );
    }
    const supplied = this.presenceCodeDigest(code);
    const expected = session.presenceCodeHash;
    const valid =
      supplied.length === expected.length &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!valid) {
      await this.database.db
        .update(tableServiceSessions)
        .set({
          presenceCodeAttempts: sql`${tableServiceSessions.presenceCodeAttempts} + 1`,
          updatedAt: now,
        })
        .where(eq(tableServiceSessions.id, session.id));
      throw new ForbiddenException("Código da mesa inválido");
    }
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + session.guestSessionTtlMinutes * 60_000);
    await this.database.db.insert(qrGuestSessions).values({
      tenantId: resolved.tenant.id,
      branchId: resolved.table.branchId,
      tableServiceSessionId: session.id,
      tokenHash: sha256(rawToken),
      validationMethod: "code",
      expiresAt,
      lastUsedAt: now,
    });
    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
      validationMethod: "code" as const,
    };
  }

  async requestPresenceApproval(token: string) {
    const resolved = await this.resolveToken(token);
    const [session] = await this.database.db
      .select()
      .from(tableServiceSessions)
      .where(
        and(
          eq(tableServiceSessions.tenantId, resolved.tenant.id),
          eq(tableServiceSessions.tableId, resolved.table.id),
          eq(tableServiceSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!session?.presenceMethods.includes("approval")) {
      throw new ForbiddenException("Aprovação da equipe não está disponível para esta mesa");
    }
    const claimKey = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const [request] = await this.database.db
      .insert(qrGuestAccessRequests)
      .values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        tableServiceSessionId: session.id,
        claimKeyHash: sha256(claimKey),
        expiresAt,
      })
      .returning({ id: qrGuestAccessRequests.id, expiresAt: qrGuestAccessRequests.expiresAt });
    if (!request) throw new ConflictException("Não foi possível solicitar a aprovação");
    return { requestId: request.id, claimKey, expiresAt: request.expiresAt.toISOString() };
  }

  async validatePresenceNetwork(token: string, remoteIp: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    if (
      !settings.presenceMethods.includes("network") ||
      !settings.trustedNetworkCidrs.some((cidr) => ipv4InCidr(remoteIp, cidr))
    ) {
      throw new ForbiddenException("A rede atual não está autorizada para esta mesa");
    }
    const [session] = await this.database.db
      .select()
      .from(tableServiceSessions)
      .where(
        and(
          eq(tableServiceSessions.tenantId, resolved.tenant.id),
          eq(tableServiceSessions.tableId, resolved.table.id),
          eq(tableServiceSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!session) throw new ConflictException("O atendimento desta mesa não está ativo");
    const now = new Date();
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + session.guestSessionTtlMinutes * 60_000);
    await this.database.db.insert(qrGuestSessions).values({
      tenantId: resolved.tenant.id,
      branchId: resolved.table.branchId,
      tableServiceSessionId: session.id,
      tokenHash: sha256(rawToken),
      validationMethod: "network",
      expiresAt,
      lastUsedAt: now,
    });
    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
      validationMethod: "network" as const,
    };
  }

  async approvePresenceRequest(context: TenantContext, requestId: string) {
    const branchId = requireBranch(context);
    if (!context.userId) throw new ForbiddenException("Operador autenticado obrigatório");
    if (
      !context.permissions.includes("tenant:manage") &&
      !context.permissions.includes("approvals:manage")
    ) {
      throw new ForbiddenException("Somente a gerência pode aprovar o acesso por QR");
    }
    const now = new Date();
    const [request] = await this.database.db
      .update(qrGuestAccessRequests)
      .set({ status: "approved", approvedByUserId: context.userId, decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(qrGuestAccessRequests.tenantId, context.tenantId),
          eq(qrGuestAccessRequests.branchId, branchId),
          eq(qrGuestAccessRequests.id, requestId),
          eq(qrGuestAccessRequests.status, "pending"),
          gte(qrGuestAccessRequests.expiresAt, now),
        ),
      )
      .returning();
    if (!request) throw new ConflictException("Solicitação não encontrada ou expirada");
    await this.audit(context, "qr.presence_approved", "qr_guest_access_request", request.id, {});
    return { id: request.id, status: request.status };
  }

  async listPresenceApprovals(
    context: TenantContext,
    status: "pending" | "approved" | "rejected" | "claimed" | "expired" = "pending",
  ) {
    const branchId = requireBranch(context);
    return this.database.db
      .select({
        id: qrGuestAccessRequests.id,
        status: qrGuestAccessRequests.status,
        requestedAt: qrGuestAccessRequests.createdAt,
        expiresAt: qrGuestAccessRequests.expiresAt,
        tableId: diningTables.id,
        tableCode: diningTables.code,
        tableName: diningTables.name,
      })
      .from(qrGuestAccessRequests)
      .innerJoin(
        tableServiceSessions,
        eq(tableServiceSessions.id, qrGuestAccessRequests.tableServiceSessionId),
      )
      .innerJoin(diningTables, eq(diningTables.id, tableServiceSessions.tableId))
      .where(
        and(
          eq(qrGuestAccessRequests.tenantId, context.tenantId),
          eq(qrGuestAccessRequests.branchId, branchId),
          eq(qrGuestAccessRequests.status, status),
        ),
      )
      .orderBy(desc(qrGuestAccessRequests.createdAt));
  }

  async claimPresenceApproval(token: string, requestId: string, claimKey: string) {
    const resolved = await this.resolveToken(token);
    return this.database.db.transaction(async (tx) => {
      const now = new Date();
      const [request] = await tx
        .select()
        .from(qrGuestAccessRequests)
        .innerJoin(
          tableServiceSessions,
          eq(tableServiceSessions.id, qrGuestAccessRequests.tableServiceSessionId),
        )
        .where(
          and(
            eq(qrGuestAccessRequests.tenantId, resolved.tenant.id),
            eq(qrGuestAccessRequests.branchId, resolved.table.branchId),
            eq(qrGuestAccessRequests.id, requestId),
            eq(qrGuestAccessRequests.claimKeyHash, sha256(claimKey)),
            eq(tableServiceSessions.tableId, resolved.table.id),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .limit(1);
      if (!request) throw new NotFoundException("Solicitação de confirmação não encontrada");
      const access = request.qr_guest_access_requests;
      const session = request.table_service_sessions;
      if (access.expiresAt <= now) {
        await tx
          .update(qrGuestAccessRequests)
          .set({ status: "expired", updatedAt: now })
          .where(eq(qrGuestAccessRequests.id, access.id));
        return { status: "expired" as const };
      }
      if (access.status === "pending") return { status: "pending" as const };
      if (access.status !== "approved") return { status: access.status };
      const rawToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + session.guestSessionTtlMinutes * 60_000);
      await tx.insert(qrGuestSessions).values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        tableServiceSessionId: session.id,
        tokenHash: sha256(rawToken),
        validationMethod: "approval",
        approvedByUserId: access.approvedByUserId,
        expiresAt,
        lastUsedAt: now,
      });
      await tx
        .update(qrGuestAccessRequests)
        .set({ status: "claimed", claimedAt: now, updatedAt: now })
        .where(eq(qrGuestAccessRequests.id, access.id));
      return {
        status: "approved" as const,
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
        maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
      };
    });
  }

  async recordCommercialAttribution(token: string, destination: "giromesa" | "doseclub") {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    if (settings.marketingEnabled === false) {
      throw new ForbiddenException("Commercial attribution is disabled for this branch");
    }
    if (destination === "doseclub") {
      const [account] = await this.database.db
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
        .limit(1);
      if (
        !resolvePublicPartnerAttribution({
          accountStatus: account?.status ?? null,
          configuredBranchId: account?.configuredBranchId ?? null,
          branchId: resolved.table.branchId,
          ...(settings.marketingEnabled !== undefined
            ? { marketingEnabled: settings.marketingEnabled }
            : {}),
        })
      ) {
        throw new ForbiddenException("DoseClub attribution is unavailable for this branch");
      }
    }

    const day = new Date().toISOString().slice(0, 10);
    await this.database.db
      .insert(commercialAttributionDaily)
      .values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        day,
        destination,
        visits: 1,
      })
      .onConflictDoUpdate({
        target: [
          commercialAttributionDaily.tenantId,
          commercialAttributionDaily.branchId,
          commercialAttributionDaily.day,
          commercialAttributionDaily.source,
          commercialAttributionDaily.destination,
          commercialAttributionDaily.campaign,
        ],
        set: {
          visits: sql`${commercialAttributionDaily.visits} + 1`,
          updatedAt: new Date(),
        },
      });
    return { recorded: true, day, source: "qr_organic", destination };
  }

  async getPublicOrder(token: string, guestToken?: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const guest = await this.requireGuestSession(resolved, guestToken);
    this.assertCapability(settings, "view_tab");
    this.assertActive(resolved.table.status);
    if (!guest.orderId) {
      return { order: null };
    }
    const [order] = await this.database.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, resolved.tenant.id),
          eq(orders.branchId, resolved.table.branchId),
          eq(orders.id, guest.orderId),
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
        .where(
          and(
            eq(orderItems.tenantId, resolved.tenant.id),
            eq(orderItems.orderId, order.id),
            ...(sessionVisibilityIsOwn(guest.tabVisibility)
              ? [eq(orderItems.qrGuestSessionId, guest.id)]
              : []),
          ),
        )
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
        guestLabel: order.guestLabel,
        status: order.status,
        items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })),
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        serviceChargeCents: order.serviceChargeCents,
        totalCents: order.totalCents,
        receivedCents,
        remainingCents: Math.max(order.totalCents - receivedCents, 0),
        timeline,
      },
    };
  }

  async getPublicRealtimeScope(token: string, guestToken?: string) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const guest = await this.requireGuestSession(resolved, guestToken);
    this.assertCapability(settings, "view_tab");
    this.assertActive(resolved.table.status);
    return {
      tenantId: resolved.tenant.id,
      branchId: resolved.table.branchId,
      tableId: resolved.table.id,
      orderId: guest.orderId,
      sessionId: guest.tableServiceSessionId,
    };
  }

  async createAgeConfirmation(token: string, guestToken?: string) {
    const resolved = await this.resolveToken(token);
    await this.requireGuestSession(resolved, guestToken);
    const expiresAt = Date.now() + 8 * 60 * 60 * 1_000;
    const confirmationToken = this.signAgeConfirmation({
      kind: "age_confirmation",
      tenantId: resolved.tenant.id,
      branchId: resolved.table.branchId,
      tableId: resolved.table.id,
      version: resolved.table.qrTokenVersion,
      expiresAt,
    });
    return { token: confirmationToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  async createPublicOrder(
    token: string,
    idempotencyKey: string,
    input: PublicOrderInput,
    guestToken?: string,
  ) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const guest = await this.requireGuestSession(resolved, guestToken);
    this.assertCapability(settings, "order");
    if (guest.mode !== "self_service") {
      throw new ForbiddenException("Pedidos pelo QR não estão habilitados para esta mesa");
    }
    this.assertActive(resolved.table.status);
    const response = await this.database.db.transaction<PublicOrderReceipt>(async (tx) => {
      const replay = await reserveIdempotency(tx, {
        tenantId: resolved.tenant.id,
        tableId: resolved.table.id,
        action: "create_order",
        key: idempotencyKey,
        input,
      });
      if (replay) {
        return replay as PublicOrderReceipt;
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
      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product?.channels.includes("qr")) {
          throw new NotFoundException("Product not found or unavailable for QR");
        }
      }
      if (productRows.some((product) => product.isAlcoholic)) {
        this.assertAgeConfirmation(input.ageConfirmationToken, {
          tenantId: resolved.tenant.id,
          branchId: resolved.table.branchId,
          tableId: resolved.table.id,
          version: resolved.table.qrTokenVersion,
        });
      }
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, resolved.tenant.id),
            eq(orders.id, guest.orderId ?? "00000000-0000-0000-0000-000000000000"),
            eq(orders.branchId, resolved.table.branchId),
            eq(orders.tableId, resolved.table.id),
            inArray(orders.status, activeOrderStatuses),
          ),
        )
        .orderBy(desc(orders.openedAt), desc(orders.createdAt))
        .limit(1);
      if (!order) {
        throw new ConflictException("O atendimento desta mesa não está mais disponível");
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
          sourceChannel: "qr",
          tableServiceSessionId: guest.tableServiceSessionId,
          qrGuestSessionId: guest.id,
        });
      }
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          ...(order.guestLabel || !input.guestLabel ? {} : { guestLabel: input.guestLabel }),
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
        dispatchStatus: settings.reviewBeforeKds ? ("review" as const) : ("pending" as const),
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
    if (settings.reviewBeforeKds) {
      return response;
    }

    let dispatchStatus: PublicOrderReceipt["dispatchStatus"];
    try {
      if (!this.ordersService) {
        throw new Error("QR automatic dispatch service is unavailable");
      }
      await this.ordersService.autoSendQrOrder(
        {
          tenantId: resolved.tenant.id,
          branchId: resolved.table.branchId,
          requestId: `qr-auto-${sha256(idempotencyKey).slice(0, 16)}`,
          permissions: [],
        },
        response.orderId,
      );
      dispatchStatus = "sent";
    } catch (error) {
      // The accepted public order must never be rolled back after its durable receipt.
      // Keep it pending for the team and make the operational attention visible in audit.
      await this.database.db.insert(auditLogs).values({
        tenantId: resolved.tenant.id,
        branchId: resolved.table.branchId,
        requestId: `qr-auto-${sha256(idempotencyKey).slice(0, 16)}`,
        action: "qr.order_auto_dispatch_attention",
        entityType: "order",
        entityId: response.orderId,
        metadata: {
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        },
      });
      dispatchStatus = "attention";
    }

    const completedReceipt: PublicOrderReceipt = { ...response, dispatchStatus };
    await this.database.db.transaction((tx) =>
      completeIdempotency(tx, resolved.table.id, "create_order", idempotencyKey, completedReceipt),
    );
    return completedReceipt;
  }

  async createServiceRequest(
    token: string,
    idempotencyKey: string,
    input: PublicServiceRequestInput,
    guestToken?: string,
  ) {
    const resolved = await this.resolveToken(token);
    const settings = await this.settingsForBranch(resolved.tenant.id, resolved.table.branchId);
    const guest = await this.requireGuestSession(resolved, guestToken);
    const capability = ["request_pre_bill", "split_intent", "payment_preference"].includes(
      input.type,
    )
      ? "request_pre_bill"
      : "call_waiter";
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
      const [order] = guest.orderId
        ? await tx
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                eq(orders.tenantId, resolved.tenant.id),
                eq(orders.id, guest.orderId),
                eq(orders.tableId, resolved.table.id),
                inArray(orders.status, activeOrderStatuses),
              ),
            )
            .limit(1)
        : [];
      const [request] = await tx
        .insert(serviceRequests)
        .values({
          tenantId: resolved.tenant.id,
          branchId: resolved.table.branchId,
          tableId: resolved.table.id,
          orderId: order?.id,
          type: input.type,
          message: input.message,
          metadata:
            input.type === "split_intent"
              ? { split: input.split }
              : input.type === "payment_preference"
                ? { payment: input.payment }
                : {},
          requesterKeyHash: sha256(idempotencyKey),
          tableServiceSessionId: guest.tableServiceSessionId,
          qrGuestSessionId: guest.id,
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
        metadata: {
          tableId: resolved.table.id,
          orderId: order?.id ?? null,
          sessionId: guest.tableServiceSessionId,
          requestType: input.type,
        },
      });
      return response;
    });
  }

  async getPublicServiceRequest(token: string, requestId: string, guestToken?: string) {
    const resolved = await this.resolveToken(token);
    const guest = await this.requireGuestSession(resolved, guestToken);
    this.assertActive(resolved.table.status);
    const [request] = await this.database.db
      .select({
        id: serviceRequests.id,
        type: serviceRequests.type,
        status: serviceRequests.status,
        message: serviceRequests.message,
        metadata: serviceRequests.metadata,
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
          eq(serviceRequests.qrGuestSessionId, guest.id),
          eq(serviceRequests.tableServiceSessionId, guest.tableServiceSessionId),
          ...(guest.orderId ? [eq(serviceRequests.orderId, guest.orderId)] : []),
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
    const rows = await this.database.db
      .select({
        id: serviceRequests.id,
        tableId: serviceRequests.tableId,
        tableCode: diningTables.code,
        tableName: diningTables.name,
        orderId: serviceRequests.orderId,
        type: serviceRequests.type,
        status: serviceRequests.status,
        message: serviceRequests.message,
        metadata: serviceRequests.metadata,
        assignedWaiterUserId: tableWaiterAssignments.waiterUserId,
        assignedWaiterName: users.name,
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
      .leftJoin(
        tableWaiterAssignments,
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.branchId, requireBranch(context)),
          eq(tableWaiterAssignments.tableId, serviceRequests.tableId),
          sql`${tableWaiterAssignments.endedAt} is null`,
        ),
      )
      .leftJoin(users, eq(users.id, tableWaiterAssignments.waiterUserId))
      .where(and(...conditions))
      .orderBy(desc(serviceRequests.createdAt));
    return rows.map((request) => {
      const elapsedMs = Date.now() - request.createdAt.getTime();
      const slaSeconds = request.type === "request_pre_bill" ? 300 : 180;
      return {
        ...request,
        assignedWaiterName: request.assignedWaiterName ?? null,
        slaDueAt: new Date(request.createdAt.getTime() + slaSeconds * 1_000).toISOString(),
        attention:
          request.status === "pending" && elapsedMs >= slaSeconds * 1_000 ? "escalated" : "normal",
      };
    });
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
    const [target] = await this.database.db
      .select({ tableId: serviceRequests.tableId })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.tenantId, context.tenantId),
          eq(serviceRequests.branchId, branchId),
          eq(serviceRequests.id, id),
        ),
      )
      .limit(1);
    if (!target) throw new NotFoundException("Service request not found");
    const [assignment] = await this.database.db
      .select({ waiterUserId: tableWaiterAssignments.waiterUserId })
      .from(tableWaiterAssignments)
      .where(
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.branchId, branchId),
          eq(tableWaiterAssignments.tableId, target.tableId),
          sql`${tableWaiterAssignments.endedAt} is null`,
        ),
      )
      .limit(1);
    if (
      assignment &&
      assignment.waiterUserId !== context.userId &&
      !context.permissions.includes("tenant:manage")
    ) {
      throw new ForbiddenException(
        "Esta solicitaÃ§Ã£o foi direcionada ao garÃ§om responsÃ¡vel pela mesa",
      );
    }
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

  private signAgeConfirmation(payload: AgeConfirmationPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", loadEnv().QR_SIGNING_SECRET)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private assertAgeConfirmation(token: string | undefined, expected: TokenPayload) {
    if (!token) {
      throw new ForbiddenException("Age confirmation is required for alcoholic products");
    }
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) {
      throw new ForbiddenException("Age confirmation is invalid or expired");
    }
    const expectedSignature = createHmac("sha256", loadEnv().QR_SIGNING_SECRET)
      .update(encoded)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, "base64url");
    } catch {
      throw new ForbiddenException("Age confirmation is invalid or expired");
    }
    if (
      expectedSignature.length !== supplied.length ||
      !timingSafeEqual(expectedSignature, supplied)
    ) {
      throw new ForbiddenException("Age confirmation is invalid or expired");
    }
    try {
      const value = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as AgeConfirmationPayload;
      if (
        value.kind !== "age_confirmation" ||
        value.tenantId !== expected.tenantId ||
        value.branchId !== expected.branchId ||
        value.tableId !== expected.tableId ||
        value.version !== expected.version ||
        !Number.isInteger(value.expiresAt) ||
        value.expiresAt <= Date.now()
      ) {
        throw new Error("invalid");
      }
    } catch {
      throw new ForbiddenException("Age confirmation is invalid or expired");
    }
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

  private async settingsForBranch(tenantId: string, branchId: string, activateScheduled = true) {
    if (activateScheduled) await this.activateScheduledExperience(tenantId, branchId);
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

  private async assertPersonalizationScope(
    tenantId: string,
    branchId: string,
    config: Partial<GuestExperienceConfig>,
  ) {
    const categoryIds = Object.keys(config.categoryLabels ?? {});
    if (categoryIds.length) {
      const rows = await this.database.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenantId),
            inArray(categories.id, categoryIds),
            or(eq(categories.branchId, branchId), sql`${categories.branchId} is null`),
          ),
        );
      if (rows.length !== new Set(categoryIds).size) {
        throw new BadRequestException("Category customization contains an invalid category");
      }
    }

    const productIds = [...new Set(config.recommendedProductIds ?? [])];
    if (productIds.length) {
      const rows = await this.database.db
        .select({
          id: products.id,
          channels: products.channels,
          isActive: products.isActive,
          isAvailable: products.isAvailable,
        })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
      if (
        rows.length !== productIds.length ||
        rows.some(
          (product) =>
            !product.isActive || !product.isAvailable || !product.channels.includes("qr"),
        )
      ) {
        throw new BadRequestException(
          "Recommendations must reference QR products from this tenant",
        );
      }
    }
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

  private async requireGuestSession(
    resolved: { tenant: typeof tenants.$inferSelect; table: typeof diningTables.$inferSelect },
    token: string | undefined,
  ): Promise<PublicGuestSession> {
    if (!token) throw new ForbiddenException("Confirme que você está nesta mesa para continuar");
    const now = new Date();
    const [row] = await this.database.db
      .select({ guest: qrGuestSessions, service: tableServiceSessions })
      .from(qrGuestSessions)
      .innerJoin(
        tableServiceSessions,
        eq(tableServiceSessions.id, qrGuestSessions.tableServiceSessionId),
      )
      .where(
        and(
          eq(qrGuestSessions.tokenHash, sha256(token)),
          eq(qrGuestSessions.tenantId, resolved.tenant.id),
          eq(qrGuestSessions.branchId, resolved.table.branchId),
          eq(qrGuestSessions.status, "active"),
          gte(qrGuestSessions.expiresAt, now),
          eq(tableServiceSessions.tableId, resolved.table.id),
          eq(tableServiceSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!row) throw new ForbiddenException("A confirmação desta mesa expirou");
    await this.database.db
      .update(qrGuestSessions)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(eq(qrGuestSessions.id, row.guest.id));
    return {
      id: row.guest.id,
      tableServiceSessionId: row.guest.tableServiceSessionId,
      expiresAt: row.guest.expiresAt,
      mode: row.service.mode,
      tabVisibility: row.service.tabVisibility,
      orderId: row.service.orderId,
    };
  }

  private async revokeBranchServiceSessions(
    context: TenantContext,
    branchId: string,
    reason: string,
  ) {
    const rows = await this.database.db.transaction(async (tx) => {
      const sessions = await tx
        .update(tableServiceSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: context.userId ?? null,
          revokeReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tableServiceSessions.tenantId, context.tenantId),
            eq(tableServiceSessions.branchId, branchId),
            eq(tableServiceSessions.status, "active"),
          ),
        )
        .returning({ id: tableServiceSessions.id });
      if (sessions.length) {
        await tx
          .update(qrGuestSessions)
          .set({
            status: "revoked",
            revokedAt: new Date(),
            revokedByUserId: context.userId ?? null,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              qrGuestSessions.tableServiceSessionId,
              sessions.map((session) => session.id),
            ),
          );
      }
      return sessions;
    });
    return rows.length;
  }

  private presenceCodeDigest(code: string) {
    return createHmac("sha256", loadEnv().QR_SIGNING_SECRET)
      .update(`qr-presence:${code}`)
      .digest("hex");
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

function isQrLanguage(value: unknown): value is QrLanguage {
  return value === "pt-BR" || value === "en" || value === "es";
}

export function sanitizeQrExperienceAssetUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\/uploads\/[A-Za-z0-9._/-]+$/.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("https://") || /[\s<>"'`\\]/.test(trimmed)) return undefined;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function defaultSettings(branchId: string): QrBranchSettings {
  return {
    branchId,
    mode: "waiter_assisted",
    presenceMethods: ["code"],
    tabVisibility: "shared",
    presenceCodeTtlMinutes: 30,
    guestSessionTtlMinutes: 720,
    trustedNetworkCidrs: [],
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
  const coverUrl = sanitizeQrExperienceAssetUrl(config.coverUrl);
  const personalization = sanitizeQrPersonalization(config);
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
    ...(coverUrl !== undefined ? { coverUrl } : {}),
    ...(isQrLanguage(config.language) ? { language: config.language } : {}),
    ...(Array.isArray(config.highlights)
      ? {
          highlights: config.highlights
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 6),
        }
      : {}),
    ...(typeof config.campaignMessage === "string"
      ? { campaignMessage: config.campaignMessage.trim().slice(0, 180) }
      : {}),
    ...(typeof config.houseInfo === "string"
      ? { houseInfo: config.houseInfo.trim().slice(0, 300) }
      : {}),
    ...personalization,
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
    mode: row.mode,
    presenceMethods: row.presenceMethods,
    tabVisibility: row.tabVisibility,
    presenceCodeTtlMinutes: row.presenceCodeTtlMinutes,
    guestSessionTtlMinutes: row.guestSessionTtlMinutes,
    trustedNetworkCidrs: row.trustedNetworkCidrs,
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

function sessionVisibilityIsOwn(value: PublicGuestSession["tabVisibility"]) {
  return value === "own_items";
}

function ipv4InCidr(ip: string, cidr: string) {
  const [network, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  if (!network || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const asNumber = (value: string) => {
    const parts = value.replace(/^::ffff:/, "").split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255))
      return null;
    return parts.reduce((accumulator, part) => accumulator * 256 + Number(part), 0);
  };
  const candidate = asNumber(ip);
  const base = asNumber(network);
  if (candidate === null || base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (candidate & mask) === (base & mask);
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
