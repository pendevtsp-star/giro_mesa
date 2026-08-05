import { isDeepStrictEqual } from "node:util";
import {
  auditLogs,
  branches,
  branchInventorySettings,
  customers,
  integrationAccounts,
  inventoryItems,
  orders,
  outboxEvents,
  products,
  recipeItems,
  recipes,
  stockLocations,
  stockMovements,
  webhookEvents,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { createIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";
import { enqueueClubWhiskyStockUpdatedForInventoryItems } from "./club-whisky-events";

type DatabaseClient = Pick<DatabaseService["db"], "execute" | "insert" | "select" | "update">;

export type ClubSaleInput = {
  branchId: string;
  saleType: "individual" | "combo_pool";
  productId?: string | undefined;
  eligibleProductIds?: string[] | undefined;
  quantityBottles: number;
  totalDoses?: number | undefined;
  doseMl?: number | undefined;
  externalClubId: string;
  externalOfferId?: string | undefined;
  externalCustomerId?: string | undefined;
  idempotencyKey: string;
};

export type ClubDoseConsumptionInput = {
  branchId: string;
  orderId?: string | undefined;
  productId: string;
  externalClubId: string;
  externalOfferId?: string | undefined;
  offerType?: "individual" | "combo_pool" | undefined;
  externalConsumptionId: string;
  doseMl: number;
  employeeRef?: string | undefined;
  idempotencyKey: string;
};

export type ClubDoseConsumptionReversalInput = {
  branchId: string;
  productId: string;
  externalClubId: string;
  externalConsumptionId: string;
  externalReversalId: string;
  originalIdempotencyKey: string;
  doseMl: number;
  reason: string;
  idempotencyKey: string;
};

export type CustomerLinkInput = {
  customerId: string;
  externalCustomerId: string;
  idempotencyKey: string;
};

export type ConfigureClubWhiskyInput = {
  branchId: string;
  remoteClientId?: string | undefined;
  webhookSecretRef?: string | undefined;
  webhookUrl?: string | undefined;
  rotateKey?: boolean;
};

export const CLUB_WHISKY_CONTRACT_VERSION = "2026-07-30";
export type ClubWhiskyLifecycleInput =
  | {
      event: "activate";
      expectedVersion: number;
      contractVersion: typeof CLUB_WHISKY_CONTRACT_VERSION;
      evidence: string;
    }
  | { event: "health"; expectedVersion: number; healthy: boolean; detail: string }
  | { event: "revoke"; expectedVersion: number; reason: string };

@Injectable()
export class ClubWhiskyService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listBranches(context: TenantContext) {
    return this.database.db
      .select({
        id: branches.id,
        name: branches.name,
        timezone: branches.timezone,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(
        context.branchId
          ? and(eq(branches.tenantId, context.tenantId), eq(branches.id, context.branchId))
          : eq(branches.tenantId, context.tenantId),
      );
  }

  async listEligibleProducts(context: TenantContext) {
    return this.database.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceCents: products.priceCents,
        costCents: products.costCents,
        isAvailable: products.isAvailable,
        bottleVolumeMl: products.bottleVolumeMl,
        defaultDoseMl: products.defaultDoseMl,
        spiritType: products.spiritType,
        channels: products.channels,
      })
      .from(products)
      .where(
        and(
          eq(products.tenantId, context.tenantId),
          eq(products.isActive, true),
          eq(products.isClubEligible, true),
        ),
      );
  }

  async listStockAvailability(context: TenantContext, branchId: string, productId?: string) {
    this.assertBranchAccess(context, branchId);
    await this.assertExistingBranch(this.database.db, context, branchId);

    return this.database.db
      .select({
        productId: products.id,
        productName: products.name,
        inventoryItemId: inventoryItems.id,
        inventoryItemName: inventoryItems.name,
        unit: inventoryItems.unit,
        quantityMl: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
        allowNegative: inventoryItems.allowNegative,
      })
      .from(products)
      .leftJoin(
        recipes,
        and(eq(recipes.tenantId, context.tenantId), eq(recipes.productId, products.id)),
      )
      .leftJoin(
        recipeItems,
        and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipes.id)),
      )
      .leftJoin(
        inventoryItems,
        and(
          eq(inventoryItems.tenantId, context.tenantId),
          eq(inventoryItems.id, recipeItems.inventoryItemId),
        ),
      )
      .leftJoin(
        stockMovements,
        and(
          eq(stockMovements.inventoryItemId, inventoryItems.id),
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.branchId, branchId),
        ),
      )
      .where(
        and(
          eq(products.tenantId, context.tenantId),
          eq(products.isActive, true),
          eq(products.isClubEligible, true),
          ...(productId ? [eq(products.id, productId)] : []),
        ),
      )
      .groupBy(products.id, inventoryItems.id);
  }

  async registerClubSale(context: TenantContext, input: ClubSaleInput) {
    this.assertBranchAccess(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
      await this.assertExistingBranch(tx, context, input.branchId);
      const idempotency = await this.reserveIdempotency(
        tx,
        context.tenantId,
        input.idempotencyKey,
        {
          action: "club_sale_registered",
          input,
        },
      );
      if (idempotency.duplicate) {
        return idempotency;
      }
      const requestedProductIds =
        input.saleType === "combo_pool"
          ? [...new Set(input.eligibleProductIds ?? [])]
          : input.productId
            ? [input.productId]
            : [];

      if (
        (input.saleType === "individual" && requestedProductIds.length !== 1) ||
        (input.saleType === "combo_pool" && requestedProductIds.length < 2)
      ) {
        throw new BadRequestException("Invalid products for the selected club sale type");
      }

      const eligibleProducts = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, context.tenantId),
            eq(products.isClubEligible, true),
            inArray(products.id, requestedProductIds),
          ),
        );

      if (eligibleProducts.length !== requestedProductIds.length) {
        throw new NotFoundException("One or more club-eligible products were not found");
      }

      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "club.sale.registered",
        payload: {
          integration: "club_whisky",
          saleType: input.saleType,
          productIds: requestedProductIds,
          branchId: input.branchId,
          externalClubId: input.externalClubId,
          externalOfferId: input.externalOfferId,
          quantityBottles: input.quantityBottles,
          totalDoses: input.totalDoses,
          doseMl: input.doseMl,
          stockQuantityEffect: 0,
        },
      });

      await this.audit(tx, context, {
        branchId: input.branchId,
        action: "club_whisky.club_sale_registered",
        entityType: "club_membership",
        metadata: {
          externalClubId: input.externalClubId,
          externalOfferId: input.externalOfferId,
          saleType: input.saleType,
          productIds: requestedProductIds,
          quantityBottles: input.quantityBottles,
          totalDoses: input.totalDoses,
          doseMl: input.doseMl,
          stockQuantityEffect: 0,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        accepted: true,
        duplicate: false,
        eventType: "club_sale_registered",
        saleType: input.saleType,
        productIds: requestedProductIds,
        stockMovementCreated: false,
        stockQuantityEffect: 0,
        idempotency: "provider_external_event_id",
      };
    });
  }

  async registerDoseConsumption(context: TenantContext, input: ClubDoseConsumptionInput) {
    this.assertBranchAccess(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
      await this.assertExistingBranch(tx, context, input.branchId);
      if (input.orderId) {
        const [order] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.tenantId, context.tenantId),
              eq(orders.branchId, input.branchId),
              eq(orders.id, input.orderId),
            ),
          )
          .limit(1);
        if (!order) {
          throw new BadRequestException("orderId is not valid for this tenant and branch");
        }
      }
      const idempotency = await this.reserveIdempotency(
        tx,
        context.tenantId,
        input.idempotencyKey,
        {
          action: "club_dose_consumed",
          input,
        },
      );
      if (idempotency.duplicate) {
        return idempotency;
      }
      const [sourceEvent] = await tx
        .select({ id: webhookEvents.id })
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, "club_whisky"),
            eq(webhookEvents.tenantId, context.tenantId),
            eq(
              webhookEvents.externalEventId,
              this.idempotencyEventId(context.tenantId, input.idempotencyKey),
            ),
          ),
        )
        .limit(1);
      if (!sourceEvent) throw new Error("Failed to link club consumption idempotency event");

      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, context.tenantId),
            eq(products.id, input.productId),
            eq(products.isClubEligible, true),
          ),
        )
        .limit(1);

      if (!product) {
        throw new NotFoundException("Club-eligible product not found");
      }

      const target = await this.resolveClubInventoryTarget(tx, context, input.branchId, product.id);
      await this.lockStockTarget(
        tx,
        context,
        input.branchId,
        target.inventoryItemId,
        target.stockLocationId,
      );
      const availableMl = await this.currentStock(
        tx,
        context,
        input.branchId,
        target.inventoryItemId,
        target.stockLocationId,
      );

      if (!target.allowNegative && availableMl < input.doseMl) {
        throw new ConflictException({
          error: "insufficient_stock",
          productId: product.id,
          inventoryItemId: target.inventoryItemId,
          availableMl,
          requestedMl: input.doseMl,
        });
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          inventoryItemId: target.inventoryItemId,
          stockLocationId: target.stockLocationId,
          type: "club_dose_consumed",
          quantity: String(-input.doseMl),
          sourceType: "club_whisky",
          sourceId: sourceEvent.id,
          reason: `Consumo de ${input.doseMl}ml do clube ${input.externalClubId}; consumption=${input.externalConsumptionId}`,
        })
        .returning({ id: stockMovements.id });

      if (!movement) {
        throw new Error("Failed to create club stock movement");
      }

      const remainingMl = availableMl - input.doseMl;
      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "club.stock_movement.created",
        payload: {
          integration: "club_whisky",
          movementType: "club_dose_consumed",
          productId: product.id,
          branchId: input.branchId,
          externalClubId: input.externalClubId,
          externalConsumptionId: input.externalConsumptionId,
          ...(input.orderId ? { orderId: input.orderId } : {}),
          doseMl: input.doseMl,
          unit: "ml",
          stockQuantityEffect: -input.doseMl,
          remainingMl,
        },
      });
      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: input.branchId,
        inventoryItemIds: [target.inventoryItemId],
        movementType: "club_dose_consumed",
        movementId: movement.id,
      });

      await this.audit(tx, context, {
        branchId: input.branchId,
        action: "club_whisky.dose_consumed",
        entityType: "product",
        entityId: product.id,
        metadata: {
          externalClubId: input.externalClubId,
          externalOfferId: input.externalOfferId,
          offerType: input.offerType,
          externalConsumptionId: input.externalConsumptionId,
          ...(input.orderId ? { orderId: input.orderId } : {}),
          doseMl: input.doseMl,
          inventoryItemId: target.inventoryItemId,
          stockQuantityEffect: -input.doseMl,
          remainingMl,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        accepted: true,
        duplicate: false,
        movementType: "club_dose_consumed",
        inventoryItemId: target.inventoryItemId,
        unit: "ml",
        stockQuantityEffect: -input.doseMl,
        remainingMl,
        idempotency: "provider_external_event_id",
      };
    });
  }

  async reverseDoseConsumption(context: TenantContext, input: ClubDoseConsumptionReversalInput) {
    this.assertBranchAccess(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
      await this.assertExistingBranch(tx, context, input.branchId);
      const originalExternalEventId = this.idempotencyEventId(
        context.tenantId,
        input.originalIdempotencyKey,
      );
      const [originalEvent] = await tx
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, "club_whisky"),
            eq(webhookEvents.tenantId, context.tenantId),
            eq(webhookEvents.externalEventId, originalExternalEventId),
          ),
        )
        .limit(1);

      const originalPayload = originalEvent?.payload;
      const originalInput =
        originalPayload &&
        originalPayload.action === "club_dose_consumed" &&
        typeof originalPayload.input === "object" &&
        originalPayload.input
          ? (originalPayload.input as Record<string, unknown>)
          : undefined;

      if (
        !originalEvent ||
        !originalInput ||
        originalInput.branchId !== input.branchId ||
        originalInput.productId !== input.productId ||
        originalInput.externalClubId !== input.externalClubId ||
        originalInput.externalConsumptionId !== input.externalConsumptionId ||
        originalInput.doseMl !== input.doseMl
      ) {
        throw new ConflictException({
          error: "original_consumption_mismatch",
          originalIdempotencyKey: input.originalIdempotencyKey,
        });
      }

      const [originalMovement] = await tx
        .select({
          id: stockMovements.id,
          inventoryItemId: stockMovements.inventoryItemId,
          stockLocationId: stockMovements.stockLocationId,
          quantity: stockMovements.quantity,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.tenantId, context.tenantId),
            eq(stockMovements.branchId, input.branchId),
            eq(stockMovements.type, "club_dose_consumed"),
            eq(stockMovements.sourceType, "club_whisky"),
            eq(stockMovements.sourceId, originalEvent.id),
          ),
        )
        .limit(1);
      const originalQuantity = Math.abs(Number(originalMovement?.quantity));
      if (
        !originalMovement?.stockLocationId ||
        !Number.isFinite(originalQuantity) ||
        originalQuantity <= 0
      ) {
        throw new ConflictException({
          error: "original_consumption_movement_not_found",
          originalIdempotencyKey: input.originalIdempotencyKey,
        });
      }

      const idempotency = await this.reserveIdempotency(
        tx,
        context.tenantId,
        `reversal:${input.originalIdempotencyKey}`,
        {
          action: "club_dose_reversed",
          input,
        },
      );
      if (idempotency.duplicate) {
        return idempotency;
      }
      await this.lockStockTarget(
        tx,
        context,
        input.branchId,
        originalMovement.inventoryItemId,
        originalMovement.stockLocationId,
      );
      const availableMl = await this.currentStock(
        tx,
        context,
        input.branchId,
        originalMovement.inventoryItemId,
        originalMovement.stockLocationId,
      );

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          inventoryItemId: originalMovement.inventoryItemId,
          stockLocationId: originalMovement.stockLocationId,
          type: "club_refund",
          quantity: String(originalQuantity),
          sourceType: "club_whisky_reversal",
          sourceId: originalMovement.id,
          reason: `Estorno de ${originalQuantity}ml; consumption=${input.externalConsumptionId}; reversal=${input.externalReversalId}; ${input.reason}`,
        })
        .returning({ id: stockMovements.id });

      if (!movement) {
        throw new Error("Failed to create club stock reversal");
      }

      const remainingMl = availableMl + originalQuantity;
      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "club.stock_movement.created",
        payload: {
          integration: "club_whisky",
          movementType: "club_refund",
          productId: input.productId,
          branchId: input.branchId,
          externalClubId: input.externalClubId,
          externalConsumptionId: input.externalConsumptionId,
          externalReversalId: input.externalReversalId,
          ...(typeof originalInput.orderId === "string" ? { orderId: originalInput.orderId } : {}),
          doseMl: originalQuantity,
          unit: "ml",
          stockQuantityEffect: originalQuantity,
          remainingMl,
        },
      });
      await enqueueClubWhiskyStockUpdatedForInventoryItems(tx, context, {
        branchId: input.branchId,
        inventoryItemIds: [originalMovement.inventoryItemId],
        movementType: "club_refund",
        movementId: movement.id,
      });

      await this.audit(tx, context, {
        branchId: input.branchId,
        action: "club_whisky.dose_consumption_reversed",
        entityType: "product",
        entityId: input.productId,
        metadata: {
          externalClubId: input.externalClubId,
          externalConsumptionId: input.externalConsumptionId,
          externalReversalId: input.externalReversalId,
          originalIdempotencyKey: input.originalIdempotencyKey,
          inventoryItemId: originalMovement.inventoryItemId,
          stockLocationId: originalMovement.stockLocationId,
          originalMovementId: originalMovement.id,
          reversalMovementId: movement.id,
          doseMl: originalQuantity,
          reason: input.reason,
          stockQuantityEffect: originalQuantity,
          remainingMl,
          ...(typeof originalInput.orderId === "string" ? { orderId: originalInput.orderId } : {}),
        },
      });

      return {
        accepted: true,
        duplicate: false,
        movementType: "club_refund",
        inventoryItemId: originalMovement.inventoryItemId,
        unit: "ml",
        stockQuantityEffect: originalQuantity,
        remainingMl,
        idempotency: "original_consumption_once",
      };
    });
  }

  async linkCustomer(context: TenantContext, input: CustomerLinkInput) {
    return this.database.db.transaction(async (tx) => {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, context.tenantId), eq(customers.id, input.customerId)))
        .limit(1);

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }

      const idempotency = await this.reserveIdempotency(
        tx,
        context.tenantId,
        input.idempotencyKey,
        {
          action: "customer_link",
          input,
        },
      );
      if (idempotency.duplicate) {
        return idempotency;
      }

      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "customer.updated",
        payload: {
          integration: "club_whisky",
          customerId: input.customerId,
          externalCustomerId: input.externalCustomerId,
        },
      });

      await this.audit(tx, context, {
        action: "club_whisky.customer_linked",
        entityType: "customer",
        entityId: input.customerId,
        metadata: {
          externalCustomerId: input.externalCustomerId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        accepted: true,
        duplicate: false,
        customerId: input.customerId,
        externalCustomerId: input.externalCustomerId,
      };
    });
  }

  async ensureIntegrationAccount(context: TenantContext, input: ConfigureClubWhiskyInput) {
    this.assertBranchAccess(context, input.branchId);
    await this.assertExistingBranch(this.database.db, context, input.branchId);
    const [existingAccount] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, "club_whisky"),
        ),
      )
      .limit(1);

    const shouldIssueKey = !existingAccount?.apiKeyHash || input.rotateKey === true;
    const issuedKey = shouldIssueKey ? createIntegrationApiKey("club_whisky") : undefined;

    const config = {
      branchId: input.branchId,
      scopes: [
        "branches:read",
        "products:read",
        "stock:read",
        "club_sales:write",
        "club_consumption:write",
        "club_consumption:reverse",
        "customers:link",
      ],
      remoteClientId: input.remoteClientId ?? existingAccount?.config.remoteClientId ?? null,
      webhookUrl: input.webhookUrl ?? existingAccount?.config.webhookUrl ?? null,
      webhookSecretRef:
        input.webhookSecretRef ??
        existingAccount?.config.webhookSecretRef ??
        "CLUB_WHISKY_WEBHOOK_SECRET",
      contractVersion: CLUB_WHISKY_CONTRACT_VERSION,
      lifecycleVersion: readLifecycleVersion(existingAccount?.config) + 1,
      lifecycleReason: "configuration_requires_homologation",
      inventoryAuthority: "giromesa",
      stateOwner: "tenant_admin",
      dependency: "Dose Club webhook and shared inventory homologation",
      contingency: "Use independent products and reconcile stock manually",
    };

    const [account] = await this.database.db
      .insert(integrationAccounts)
      .values({
        tenantId: context.tenantId,
        provider: "club_whisky",
        status: "homologation",
        config,
        secretRef: "CLUB_WHISKY_API_KEY",
        apiKeyHash: issuedKey?.tokenHash,
        apiKeyLastFour: issuedKey?.lastFour,
        apiKeyCreatedAt: issuedKey ? new Date() : undefined,
      })
      .onConflictDoUpdate({
        target: [integrationAccounts.tenantId, integrationAccounts.provider],
        set: {
          status: "homologation",
          config,
          ...(issuedKey
            ? {
                apiKeyHash: issuedKey.tokenHash,
                apiKeyLastFour: issuedKey.lastFour,
                apiKeyCreatedAt: new Date(),
              }
            : {}),
        },
      })
      .returning({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
      });

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: issuedKey
        ? "club_whisky.integration_key_rotated"
        : "club_whisky.integration_configured",
      entityType: "integration_account",
      entityId: account?.id,
      metadata: {
        provider: "club_whisky",
        scopes: config.scopes,
        keyLastFour: issuedKey?.lastFour ?? account?.apiKeyLastFour,
        webhookSecretConfigured: Boolean(config.webhookSecretRef),
      },
    });

    return {
      ...account,
      apiKey: issuedKey?.token,
      apiKeyReturnedOnce: Boolean(issuedKey),
      owner: config.stateOwner,
      dependency: config.dependency,
      contingency: config.contingency,
      lifecycleVersion: config.lifecycleVersion,
      lifecycleReason: config.lifecycleReason,
      lastHealthAt: null,
    };
  }

  async getIntegrationConfig(context: TenantContext) {
    const [account] = await this.database.db
      .select({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
        lastSyncAt: integrationAccounts.lastSyncAt,
      })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, "club_whisky"),
        ),
      )
      .limit(1);

    if (!account) {
      return {
        provider: "club_whisky",
        status: "not_configured",
        scopes: [],
        hasApiKey: false,
      };
    }

    return {
      id: account.id,
      provider: account.provider,
      status: account.status,
      branchId: typeof account.config.branchId === "string" ? account.config.branchId : null,
      remoteClientId:
        typeof account.config.remoteClientId === "string" ? account.config.remoteClientId : null,
      scopes: Array.isArray(account.config.scopes) ? account.config.scopes : [],
      webhookUrl: typeof account.config.webhookUrl === "string" ? account.config.webhookUrl : null,
      owner:
        typeof account.config.stateOwner === "string" ? account.config.stateOwner : "tenant_admin",
      dependency:
        typeof account.config.dependency === "string"
          ? account.config.dependency
          : "Dose Club homologation",
      contingency:
        typeof account.config.contingency === "string"
          ? account.config.contingency
          : "Use independent products and reconcile stock manually",
      contractVersion:
        typeof account.config.contractVersion === "string" ? account.config.contractVersion : null,
      inventoryAuthority:
        typeof account.config.inventoryAuthority === "string"
          ? account.config.inventoryAuthority
          : "giromesa",
      apiKeyLastFour: account.apiKeyLastFour,
      apiKeyCreatedAt: account.apiKeyCreatedAt,
      hasApiKey: Boolean(account.apiKeyLastFour),
      lastSyncAt: account.lastSyncAt,
      lifecycleVersion: readLifecycleVersion(account.config),
      lifecycleReason:
        typeof account.config.lifecycleReason === "string"
          ? account.config.lifecycleReason
          : "configuration_requires_homologation",
      lastHealthAt:
        typeof account.config.lastHealthAt === "string" ? account.config.lastHealthAt : null,
    };
  }

  async transitionIntegrationLifecycle(context: TenantContext, input: ClubWhiskyLifecycleInput) {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${context.tenantId}:club_whisky:lifecycle`}))`,
      );
      const [account] = await tx
        .select()
        .from(integrationAccounts)
        .where(
          and(
            eq(integrationAccounts.tenantId, context.tenantId),
            eq(integrationAccounts.provider, "club_whisky"),
          ),
        )
        .limit(1);
      if (!account) throw new NotFoundException("Dose Club integration is not configured");
      const currentVersion = readLifecycleVersion(account.config);
      if (input.expectedVersion !== currentVersion) {
        throw new ConflictException("Integration lifecycle version is stale");
      }

      const now = new Date();
      let nextStatus = account.status;
      let reason: string;
      const lifecycleMetadata: Record<string, unknown> = {};
      if (input.event === "activate") {
        if (account.status !== "homologation") {
          throw new BadRequestException("Only a homologated integration can be activated");
        }
        if (input.contractVersion !== account.config.contractVersion) {
          throw new ConflictException("Integration contract version does not match");
        }
        nextStatus = "active";
        reason = "homologation_approved";
        lifecycleMetadata.activatedAt = now.toISOString();
        lifecycleMetadata.homologationEvidence = input.evidence;
      } else if (input.event === "health") {
        if (account.status !== "active" && account.status !== "degraded") {
          throw new BadRequestException("Health transitions require an active integration");
        }
        nextStatus = input.healthy ? "active" : "degraded";
        reason = input.healthy ? "health_check_passed" : "health_check_failed";
        lifecycleMetadata.lastHealthAt = now.toISOString();
        lifecycleMetadata.healthDetail = input.detail;
      } else {
        if (account.status === "revoked") {
          throw new BadRequestException("Integration is already revoked");
        }
        nextStatus = "revoked";
        reason = "revoked_by_tenant_admin";
        lifecycleMetadata.revokedAt = now.toISOString();
        lifecycleMetadata.revocationReason = input.reason;
      }

      const nextVersion = currentVersion + 1;
      const config = {
        ...account.config,
        ...lifecycleMetadata,
        lifecycleVersion: nextVersion,
        lifecycleReason: reason,
        lifecycleUpdatedAt: now.toISOString(),
        lifecycleUpdatedBy: context.userId,
      };
      const [updated] = await tx
        .update(integrationAccounts)
        .set({
          status: nextStatus,
          config,
          lastSyncAt: input.event === "health" ? now : account.lastSyncAt,
          updatedAt: now,
        })
        .where(eq(integrationAccounts.id, account.id))
        .returning({
          id: integrationAccounts.id,
          status: integrationAccounts.status,
          lastSyncAt: integrationAccounts.lastSyncAt,
        });
      await this.audit(tx, context, {
        action: `club_whisky.integration_${input.event}`,
        entityType: "integration_account",
        entityId: account.id,
        metadata: {
          previousStatus: account.status,
          nextStatus,
          previousVersion: currentVersion,
          nextVersion,
          reason,
        },
      });
      return {
        ...updated,
        provider: "club_whisky",
        lifecycleVersion: nextVersion,
        lifecycleReason: reason,
        lastHealthAt:
          input.event === "health"
            ? now.toISOString()
            : typeof account.config.lastHealthAt === "string"
              ? account.config.lastHealthAt
              : null,
        contractVersion: account.config.contractVersion,
        owner:
          typeof account.config.stateOwner === "string"
            ? account.config.stateOwner
            : "tenant_admin",
        dependency: account.config.dependency,
        contingency: account.config.contingency,
      };
    });
  }

  private async reserveIdempotency(
    client: DatabaseClient,
    tenantId: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    const externalEventId = this.idempotencyEventId(tenantId, idempotencyKey);
    const [event] = await client
      .insert(webhookEvents)
      .values({
        provider: "club_whisky",
        tenantId,
        externalEventId,
        payload,
        status: "received",
      })
      .onConflictDoNothing()
      .returning();

    if (!event) {
      const [existing] = await client
        .select({
          payload: webhookEvents.payload,
        })
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, "club_whisky"),
            eq(webhookEvents.tenantId, tenantId),
            eq(webhookEvents.externalEventId, externalEventId),
          ),
        )
        .limit(1);

      if (!existing || !isDeepStrictEqual(existing.payload, payload)) {
        throw new ConflictException({
          error: "idempotency_key_reused_with_different_payload",
          idempotencyKey,
        });
      }
    }

    return {
      accepted: true,
      duplicate: !event,
      provider: "club_whisky",
      externalEventId: idempotencyKey,
      idempotency: "provider_external_event_id",
    };
  }

  private async audit(
    tx: DatabaseClient,
    context: TenantContext,
    input: {
      branchId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }

  private assertBranchAccess(context: TenantContext, branchId: string) {
    if (context.branchId && context.branchId !== branchId) {
      throw new ForbiddenException("Integration key is not authorized for this branch");
    }
  }

  private idempotencyEventId(tenantId: string, idempotencyKey: string) {
    return `${tenantId}:${idempotencyKey}`;
  }

  private async assertExistingBranch(
    client: DatabaseClient,
    context: TenantContext,
    branchId: string,
  ) {
    const [branch] = await client
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);

    if (!branch) {
      throw new NotFoundException("Branch not found");
    }
  }

  private async resolveClubInventoryTarget(
    client: DatabaseClient,
    context: TenantContext,
    branchId: string,
    productId: string,
  ) {
    const [recipe] = await client
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.tenantId, context.tenantId), eq(recipes.productId, productId)))
      .limit(1);

    if (!recipe) {
      throw new BadRequestException(
        "Club-eligible product must have one milliliter-based inventory recipe",
      );
    }

    const targets = await client
      .select({
        inventoryItemId: inventoryItems.id,
        inventoryUnit: inventoryItems.unit,
        recipeUnit: recipeItems.unit,
        allowNegative: inventoryItems.allowNegative,
      })
      .from(recipeItems)
      .innerJoin(
        inventoryItems,
        and(
          eq(inventoryItems.tenantId, context.tenantId),
          eq(inventoryItems.id, recipeItems.inventoryItemId),
        ),
      )
      .where(and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipe.id)));

    if (
      targets.length !== 1 ||
      targets[0]?.inventoryUnit.toLowerCase() !== "ml" ||
      targets[0]?.recipeUnit.toLowerCase() !== "ml"
    ) {
      throw new BadRequestException(
        "Club-eligible product must map to exactly one inventory item measured in ml",
      );
    }

    const [stockLocation] = await client
      .select({ id: stockLocations.id })
      .from(branchInventorySettings)
      .innerJoin(
        stockLocations,
        and(
          eq(stockLocations.tenantId, branchInventorySettings.tenantId),
          eq(stockLocations.branchId, branchInventorySettings.branchId),
          eq(stockLocations.id, branchInventorySettings.consumptionLocationId),
          isNull(stockLocations.archivedAt),
          ne(stockLocations.type, "transit"),
        ),
      )
      .where(
        and(
          eq(branchInventorySettings.tenantId, context.tenantId),
          eq(branchInventorySettings.branchId, branchId),
        ),
      )
      .limit(1);

    if (!stockLocation) {
      throw new ConflictException("Configure the branch consumption stock location");
    }

    return {
      inventoryItemId: targets[0].inventoryItemId,
      allowNegative: targets[0].allowNegative,
      stockLocationId: stockLocation.id,
    };
  }

  private async lockStockTarget(
    client: DatabaseClient,
    context: TenantContext,
    branchId: string,
    inventoryItemId: string,
    stockLocationId: string,
  ) {
    const lockKey = `${context.tenantId}:${branchId}:${inventoryItemId}:${stockLocationId}`;
    await client.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
  }

  private async currentStock(
    client: DatabaseClient,
    context: TenantContext,
    branchId: string,
    inventoryItemId: string,
    stockLocationId: string,
  ) {
    const [result] = await client
      .select({
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.branchId, branchId),
          eq(stockMovements.inventoryItemId, inventoryItemId),
          eq(stockMovements.stockLocationId, stockLocationId),
        ),
      );

    return Number(result?.quantity ?? 0);
  }
}

function readLifecycleVersion(config: Record<string, unknown> | undefined) {
  const version = config?.lifecycleVersion;
  return typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0;
}
