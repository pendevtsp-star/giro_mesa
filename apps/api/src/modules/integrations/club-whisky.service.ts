import {
  auditLogs,
  branches,
  customers,
  integrationAccounts,
  inventoryItems,
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
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { createIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";

type InsertClient = Pick<DatabaseService["db"], "insert">;

export type ClubSaleInput = {
  branchId: string;
  productId: string;
  quantityBottles: number;
  externalClubId: string;
  externalCustomerId?: string | undefined;
  idempotencyKey: string;
};

export type ClubDoseConsumptionInput = {
  branchId: string;
  productId: string;
  externalClubId: string;
  externalConsumptionId: string;
  doseMl: number;
  employeeRef?: string | undefined;
  idempotencyKey: string;
};

export type CustomerLinkInput = {
  customerId: string;
  externalCustomerId: string;
  idempotencyKey: string;
};

export type ConfigureClubWhiskyInput = {
  branchId?: string | undefined;
  rotateKey?: boolean;
};

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

  async listStockAvailability(context: TenantContext, branchId: string) {
    return this.database.db
      .select({
        inventoryItemId: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(inventoryItems)
      .leftJoin(
        stockMovements,
        and(
          eq(stockMovements.inventoryItemId, inventoryItems.id),
          eq(stockMovements.tenantId, context.tenantId),
          eq(stockMovements.branchId, branchId),
        ),
      )
      .where(eq(inventoryItems.tenantId, context.tenantId))
      .groupBy(inventoryItems.id);
  }

  async registerClubSale(context: TenantContext, input: ClubSaleInput) {
    this.assertBranchAccess(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
      const idempotency = await this.reserveIdempotency(
        tx,
        context.tenantId,
        input.idempotencyKey,
        {
          action: "club_bottle_sale",
          input,
        },
      );
      if (idempotency.duplicate) {
        return idempotency;
      }

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

      const [defaultLocation] = await tx
        .select()
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.tenantId, context.tenantId),
            eq(stockLocations.branchId, input.branchId),
          ),
        )
        .limit(1);

      const [recipe] = await tx
        .select()
        .from(recipes)
        .where(and(eq(recipes.tenantId, context.tenantId), eq(recipes.productId, product.id)))
        .limit(1);

      const ingredients = recipe
        ? await tx
            .select()
            .from(recipeItems)
            .where(
              and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipe.id)),
            )
        : [];

      if (ingredients.length === 0) {
        await tx.insert(outboxEvents).values({
          tenantId: context.tenantId,
          topic: "club.stock_movement.created",
          payload: {
            integration: "club_whisky",
            movementType: "club_bottle_sale",
            productId: product.id,
            branchId: input.branchId,
            externalClubId: input.externalClubId,
            warning: "product_has_no_recipe_for_stock_decrement",
          },
        });
      }

      for (const ingredient of ingredients) {
        await tx.insert(stockMovements).values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          inventoryItemId: ingredient.inventoryItemId,
          stockLocationId: defaultLocation?.id,
          type: "club_bottle_sale",
          quantity: String(-Number(ingredient.quantity) * input.quantityBottles),
          sourceType: "club_whisky",
          sourceId: product.id,
          reason: `Venda de clube ${input.externalClubId}; idempotency=${input.idempotencyKey}`,
        });
      }

      await tx.insert(outboxEvents).values({
        tenantId: context.tenantId,
        topic: "club.stock_movement.created",
        payload: {
          integration: "club_whisky",
          movementType: "club_bottle_sale",
          productId: product.id,
          branchId: input.branchId,
          externalClubId: input.externalClubId,
          quantityBottles: input.quantityBottles,
          ingredientsMoved: ingredients.length,
        },
      });

      await this.audit(tx, context, {
        branchId: input.branchId,
        action: "club_whisky.club_sale_registered",
        entityType: "product",
        entityId: product.id,
        metadata: {
          externalClubId: input.externalClubId,
          quantityBottles: input.quantityBottles,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        accepted: true,
        duplicate: false,
        movementType: "club_bottle_sale",
        productId: product.id,
        ingredientsMoved: ingredients.length,
        idempotency: "provider_external_event_id",
      };
    });
  }

  async registerDoseConsumption(context: TenantContext, input: ClubDoseConsumptionInput) {
    this.assertBranchAccess(context, input.branchId);

    return this.database.db.transaction(async (tx) => {
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

      const [recipe] = await tx
        .select()
        .from(recipes)
        .where(and(eq(recipes.tenantId, context.tenantId), eq(recipes.productId, product.id)))
        .limit(1);

      const [ingredient] = recipe
        ? await tx
            .select()
            .from(recipeItems)
            .where(
              and(eq(recipeItems.tenantId, context.tenantId), eq(recipeItems.recipeId, recipe.id)),
            )
            .limit(1)
        : [];

      if (!ingredient) {
        throw new BadRequestException(
          "Product must have a recipe to record club dose consumption marker",
        );
      }

      await tx.insert(stockMovements).values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        inventoryItemId: ingredient.inventoryItemId,
        type: "club_dose_consumed",
        quantity: "0",
        sourceType: "club_whisky",
        sourceId: product.id,
        reason: `Consumo operacional de ${input.doseMl}ml do clube ${input.externalClubId}; sem baixa dupla de estoque; consumption=${input.externalConsumptionId}`,
      });

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
          doseMl: input.doseMl,
          stockQuantityEffect: 0,
        },
      });

      await this.audit(tx, context, {
        branchId: input.branchId,
        action: "club_whisky.dose_consumed",
        entityType: "product",
        entityId: product.id,
        metadata: {
          externalClubId: input.externalClubId,
          externalConsumptionId: input.externalConsumptionId,
          doseMl: input.doseMl,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        accepted: true,
        duplicate: false,
        movementType: "club_dose_consumed",
        stockQuantityEffect: 0,
        idempotency: "provider_external_event_id",
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
        "customers:link",
      ],
      webhookUrl: null,
      webhookSecretRef: "CLUB_WHISKY_WEBHOOK_SECRET",
    };

    const [account] = await this.database.db
      .insert(integrationAccounts)
      .values({
        tenantId: context.tenantId,
        provider: "club_whisky",
        status: "active",
        config,
        secretRef: "CLUB_WHISKY_API_KEY",
        apiKeyHash: issuedKey?.tokenHash,
        apiKeyLastFour: issuedKey?.lastFour,
        apiKeyCreatedAt: issuedKey ? new Date() : undefined,
      })
      .onConflictDoUpdate({
        target: [integrationAccounts.tenantId, integrationAccounts.provider],
        set: {
          status: "active",
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
      },
    });

    return {
      ...account,
      apiKey: issuedKey?.token,
      apiKeyReturnedOnce: Boolean(issuedKey),
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
      scopes: Array.isArray(account.config.scopes) ? account.config.scopes : [],
      webhookUrl: typeof account.config.webhookUrl === "string" ? account.config.webhookUrl : null,
      apiKeyLastFour: account.apiKeyLastFour,
      apiKeyCreatedAt: account.apiKeyCreatedAt,
      hasApiKey: Boolean(account.apiKeyLastFour),
      lastSyncAt: account.lastSyncAt,
    };
  }

  private async reserveIdempotency(
    client: InsertClient,
    tenantId: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    const [event] = await client
      .insert(webhookEvents)
      .values({
        provider: "club_whisky",
        tenantId,
        externalEventId: idempotencyKey,
        payload,
        status: "received",
      })
      .onConflictDoNothing()
      .returning();

    return {
      accepted: true,
      duplicate: !event,
      provider: "club_whisky",
      externalEventId: idempotencyKey,
      idempotency: "provider_external_event_id",
    };
  }

  private async audit(
    tx: InsertClient,
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
}
