import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  branchInventorySettings,
  inventoryItems,
  inventoryTransferLines,
  inventoryTransfers,
  operationalEvents,
  operationIdempotency,
  outboxEvents,
  products,
  returnableMappings,
  stockLocations,
  stockMovements,
  suppliers,
  tenants,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { InventoryService } from "./inventory.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

runIntegration("InventoryService C1 PostgreSQL invariants", () => {
  let pool: Pool;
  let db: Db;
  let service: InventoryService;
  let tenantId = "";
  let branchId = "";
  let otherBranchId = "";
  let originId = "";
  let destinationId = "";
  let itemId = "";
  let context: TenantContext;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl, max: 8 });
    db = drizzle(pool, { schema });
    service = new InventoryService({ db } as DatabaseService);
  });

  beforeEach(async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [tenant] = await db
      .insert(tenants)
      .values({ name: `C1 ${suffix}`, slug: `c1-${suffix}`, status: "active" })
      .returning();
    if (!tenant) throw new Error("tenant fixture failed");
    tenantId = tenant.id;
    const createdBranches = await db
      .insert(branches)
      .values([
        { tenantId, name: "Matriz" },
        { tenantId, name: "Filial B" },
      ])
      .returning();
    if (!createdBranches[0] || !createdBranches[1]) throw new Error("branch fixture failed");
    branchId = createdBranches[0].id;
    otherBranchId = createdBranches[1].id;
    const locations = await db
      .insert(stockLocations)
      .values([
        { tenantId, branchId, name: "Depósito", type: "stock" },
        { tenantId, branchId, name: "Bar", type: "salon" },
      ])
      .returning();
    if (!locations[0] || !locations[1]) throw new Error("location fixture failed");
    originId = locations[0].id;
    destinationId = locations[1].id;
    const [item] = await db
      .insert(inventoryItems)
      .values({ tenantId, name: "Garrafa", unit: "un", allowNegative: false })
      .returning();
    if (!item) throw new Error("item fixture failed");
    itemId = item.id;
    await db.insert(stockMovements).values({
      tenantId,
      branchId,
      inventoryItemId: itemId,
      stockLocationId: originId,
      type: "purchase_receipt",
      quantity: "10",
      reason: "fixture",
    });
    context = {
      tenantId,
      branchId,
      requestId: `c1-${suffix}`,
      permissions: ["inventory:manage", "tenant:manage"],
    };
  });

  afterEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
    await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
    await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
    await db.delete(operationIdempotency).where(eq(operationIdempotency.tenantId, tenantId));
    await db.delete(inventoryTransferLines).where(eq(inventoryTransferLines.tenantId, tenantId));
    await db.delete(inventoryTransfers).where(eq(inventoryTransfers.tenantId, tenantId));
    await db.delete(returnableMappings).where(eq(returnableMappings.tenantId, tenantId));
    await db.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));
    await db.delete(branchInventorySettings).where(eq(branchInventorySettings.tenantId, tenantId));
    await db.delete(stockLocations).where(eq(stockLocations.tenantId, tenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, tenantId));
    await db.delete(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
    await db.delete(products).where(eq(products.tenantId, tenantId));
    await db.delete(branches).where(eq(branches.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  afterAll(async () => pool.end());

  it("applies an immediate transfer once and rejects payload mismatch", async () => {
    const input = {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Reposição do bar",
      idempotencyKey: `transfer-${crypto.randomUUID()}`,
      lines: [{ inventoryItemId: itemId, quantity: "3" }],
    };
    const first = await service.createTransfer(context, input);
    const replay = await service.createTransfer(context, input);
    expect(first.id).toBe(replay.id);
    await expect(
      service.createTransfer(context, { ...input, reason: "Payload diferente" }),
    ).rejects.toBeInstanceOf(ConflictException);
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.sourceId, first.id));
    expect(count?.value).toBe(2);
  });

  it("replays concurrent transfer creation with the same idempotency key", async () => {
    const input = {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Reposição concorrente",
      idempotencyKey: `transfer-race-${crypto.randomUUID()}`,
      lines: [{ inventoryItemId: itemId, quantity: "3" }],
    };

    const [first, second] = await Promise.all([
      service.createTransfer(context, input),
      service.createTransfer(context, input),
    ]);

    expect(first.id).toBe(second.id);
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.sourceId, first.id));
    expect(count?.value).toBe(2);
  });

  it("claims dispatch once and accepts total divergence with a reason", async () => {
    await db.insert(branchInventorySettings).values({
      tenantId,
      branchId,
      transferMode: "awaiting_receipt",
      managerApprovalThreshold: "100",
      consumptionLocationId: originId,
    });
    const draft = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Envio conferido",
      idempotencyKey: `draft-${crypto.randomUUID()}`,
      submit: false,
      lines: [{ inventoryItemId: itemId, quantity: "2" }],
    });
    const dispatched = await Promise.allSettled([
      service.dispatchDraftTransfer(context, draft.id, draft.version),
      service.dispatchDraftTransfer(context, draft.id, draft.version),
    ]);
    expect(dispatched.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [awaiting] = await service.listTransfers(context, branchId, "awaiting_receipt");
    if (!awaiting?.lines[0]) throw new Error("awaiting transfer fixture failed");
    const received = await service.receiveTransfer(context, awaiting.id, {
      expectedVersion: awaiting.version,
      lines: [
        {
          id: awaiting.lines[0].id,
          quantityReceived: "0",
          divergenceReason: "Carga integral extraviada",
        },
      ],
    });
    expect(received.status).toBe("completed");
  });

  it("claims receipt once under concurrent requests", async () => {
    await db.insert(branchInventorySettings).values({
      tenantId,
      branchId,
      transferMode: "awaiting_receipt",
      managerApprovalThreshold: "100",
      consumptionLocationId: originId,
    });
    const draft = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Recebimento concorrente",
      idempotencyKey: `receive-race-${crypto.randomUUID()}`,
      submit: false,
      lines: [{ inventoryItemId: itemId, quantity: "2" }],
    });
    const awaiting = await service.dispatchDraftTransfer(context, draft.id, draft.version);
    const [line] = await db
      .select()
      .from(inventoryTransferLines)
      .where(eq(inventoryTransferLines.transferId, draft.id));
    if (!line) throw new Error("receipt race line fixture failed");
    const input = {
      expectedVersion: awaiting.version,
      lines: [{ id: line.id, quantityReceived: "2" }],
    };

    const receipts = await Promise.allSettled([
      service.receiveTransfer(context, awaiting.id, input),
      service.receiveTransfer(context, awaiting.id, input),
    ]);

    expect(receipts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(receipts.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("receives a confirmed transfer partially and records the per-line divergence", async () => {
    await db.insert(branchInventorySettings).values({
      tenantId,
      branchId,
      transferMode: "awaiting_receipt",
      managerApprovalThreshold: "100",
      consumptionLocationId: originId,
    });
    const draft = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Envio com conferência parcial",
      idempotencyKey: `partial-${crypto.randomUUID()}`,
      submit: false,
      lines: [{ inventoryItemId: itemId, quantity: "4" }],
    });
    const awaiting = await service.dispatchDraftTransfer(context, draft.id, draft.version);
    const [line] = await db
      .select()
      .from(inventoryTransferLines)
      .where(eq(inventoryTransferLines.transferId, draft.id));
    if (!line) throw new Error("partial transfer line fixture failed");

    const received = await service.receiveTransfer(context, awaiting.id, {
      expectedVersion: awaiting.version,
      lines: [
        {
          id: line.id,
          quantityReceived: "3",
          divergenceReason: "Uma unidade avariada no transporte",
        },
      ],
    });

    expect(received.status).toBe("completed");
    const [divergence] = await db
      .select()
      .from(stockMovements)
      .where(
        sql`${stockMovements.sourceId} = ${draft.id} and ${stockMovements.type} = 'transfer_divergence'`,
      );
    expect(Number(divergence?.quantity)).toBe(-1);
  });

  it("requires tenant management permission above the per-line divergence threshold", async () => {
    await db.insert(branchInventorySettings).values({
      tenantId,
      branchId,
      transferMode: "awaiting_receipt",
      managerApprovalThreshold: "10",
      consumptionLocationId: originId,
    });
    const draft = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Envio sujeito a limite",
      idempotencyKey: `threshold-${crypto.randomUUID()}`,
      submit: false,
      lines: [{ inventoryItemId: itemId, quantity: "4" }],
    });
    const awaiting = await service.dispatchDraftTransfer(context, draft.id, draft.version);
    const [line] = await db
      .select()
      .from(inventoryTransferLines)
      .where(eq(inventoryTransferLines.transferId, draft.id));
    if (!line) throw new Error("threshold line fixture failed");
    const operatorContext = {
      ...context,
      permissions: ["inventory:manage"],
    };

    await expect(
      service.receiveTransfer(operatorContext, awaiting.id, {
        expectedVersion: awaiting.version,
        lines: [
          {
            id: line.id,
            quantityReceived: "3",
            divergenceReason: "Uma unidade avariada",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("serializes destructive adjustments and preserves the negative-stock policy", async () => {
    const losses = await Promise.allSettled([
      service.adjustStock(context, {
        branchId,
        inventoryItemId: itemId,
        stockLocationId: originId,
        type: "loss",
        quantity: "7",
        reason: "Quebra concorrente A",
      }),
      service.adjustStock(context, {
        branchId,
        inventoryItemId: itemId,
        stockLocationId: originId,
        type: "loss",
        quantity: "7",
        reason: "Quebra concorrente B",
      }),
    ]);
    expect(losses.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(losses.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects a location from another branch", async () => {
    const [foreignLocation] = await db
      .insert(stockLocations)
      .values({ tenantId, branchId: otherBranchId, name: "Outro depósito", type: "stock" })
      .returning();
    if (!foreignLocation) throw new Error("foreign location fixture failed");
    await expect(
      service.adjustStock(context, {
        branchId,
        inventoryItemId: itemId,
        stockLocationId: foreignLocation.id,
        type: "manual_adjustment",
        quantity: "1",
        reason: "Tentativa cruzada",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks archiving the configured consumption location", async () => {
    await db.insert(branchInventorySettings).values({
      tenantId,
      branchId,
      transferMode: "immediate",
      managerApprovalThreshold: "10",
      consumptionLocationId: destinationId,
    });

    await expect(service.archiveLocation(context, destinationId)).rejects.toThrow(
      "Change the branch consumption location before archiving",
    );
    const [location] = await db
      .select({ archivedAt: stockLocations.archivedAt })
      .from(stockLocations)
      .where(eq(stockLocations.id, destinationId));
    expect(location?.archivedAt).toBeNull();
  });

  it("archives a free location with its audit record in the same operation", async () => {
    const location = await service.createLocation(context, {
      branchId,
      name: "Setor sem uso",
      type: "stock",
    });

    const archived = await service.archiveLocation(context, location.id);

    expect(archived?.archivedAt).toBeInstanceOf(Date);
    const [archiveAudit] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "inventory.location_archived"),
          eq(auditLogs.entityId, location.id),
        ),
      )
      .limit(1);
    expect(archiveAudit).toBeDefined();
  });

  it("serializes transfer creation against location archiving", async () => {
    const candidate = await service.createLocation(context, {
      branchId,
      name: "Setor temporário",
      type: "stock",
    });

    const results = await Promise.allSettled([
      service.archiveLocation(context, candidate.id),
      service.createTransfer(context, {
        branchId,
        originLocationId: candidate.id,
        destinationLocationId: destinationId,
        reason: "Rascunho concorrente ao arquivo",
        idempotencyKey: `archive-race-${crypto.randomUUID()}`,
        submit: false,
        lines: [{ inventoryItemId: itemId, quantity: "1" }],
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects an inventory item owned by another tenant", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [foreignTenant] = await db
      .insert(tenants)
      .values({ name: `Foreign ${suffix}`, slug: `foreign-${suffix}`, status: "active" })
      .returning();
    if (!foreignTenant) throw new Error("foreign tenant fixture failed");
    try {
      const [foreignItem] = await db
        .insert(inventoryItems)
        .values({
          tenantId: foreignTenant.id,
          name: "Foreign item",
          unit: "un",
          allowNegative: false,
        })
        .returning();
      if (!foreignItem) throw new Error("foreign item fixture failed");

      await expect(
        service.createTransfer(context, {
          branchId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          reason: "Tentativa entre tenants",
          idempotencyKey: `foreign-${crypto.randomUUID()}`,
          lines: [{ inventoryItemId: foreignItem.id, quantity: "1" }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await db.delete(inventoryItems).where(eq(inventoryItems.tenantId, foreignTenant.id));
      await db.delete(tenants).where(eq(tenants.id, foreignTenant.id));
    }
  });

  it("claims reverse once under concurrent requests", async () => {
    const transfer = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Reposição para estorno",
      idempotencyKey: `reverse-${crypto.randomUUID()}`,
      lines: [{ inventoryItemId: itemId, quantity: "2" }],
    });
    const reversals = await Promise.allSettled([
      service.reverseTransfer(context, transfer.id, transfer.version, "Correção concorrente"),
      service.reverseTransfer(context, transfer.id, transfer.version, "Correção concorrente"),
    ]);
    expect(reversals.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("claims cancel once under concurrent requests", async () => {
    const draft = await service.createTransfer(context, {
      branchId,
      originLocationId: originId,
      destinationLocationId: destinationId,
      reason: "Rascunho concorrente",
      idempotencyKey: `cancel-${crypto.randomUUID()}`,
      submit: false,
      lines: [{ inventoryItemId: itemId, quantity: "1" }],
    });
    const cancellations = await Promise.allSettled([
      service.cancelTransfer(context, draft.id, draft.version),
      service.cancelTransfer(context, draft.id, draft.version),
    ]);
    expect(cancellations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("maps and exchanges returnables idempotently with a tenant-owned supplier", async () => {
    const [emptyItem] = await db
      .insert(inventoryItems)
      .values({ tenantId, name: "Garrafa vazia", unit: "un", allowNegative: false })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        name: "Cerveja retornável",
        priceCents: 1200,
        costCents: 600,
        channels: ["pos"],
      })
      .returning();
    const [supplier] = await db
      .insert(suppliers)
      .values({ tenantId, name: "Distribuidora" })
      .returning();
    if (!emptyItem || !product || !supplier) throw new Error("returnable fixture failed");
    const mapping = await service.upsertReturnableMapping(context, {
      productId: product.id,
      fullInventoryItemId: itemId,
      emptyInventoryItemId: emptyItem.id,
    });
    if (!mapping) throw new Error("returnable mapping fixture failed");
    await db.insert(stockMovements).values({
      tenantId,
      branchId,
      inventoryItemId: emptyItem.id,
      stockLocationId: originId,
      type: "returnable_consumption",
      quantity: "4",
      reason: "fixture",
    });
    const input = {
      branchId,
      stockLocationId: originId,
      mappingId: mapping.id,
      quantity: "2",
      type: "supplier_exchange" as const,
      reason: "Troca semanal",
      supplierId: supplier.id,
      idempotencyKey: `returnable-${crypto.randomUUID()}`,
    };
    const first = await service.recordReturnableEvent(context, input);
    const replay = await service.recordReturnableEvent(context, input);
    expect(first.id).toBe(replay.id);
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.sourceId, first.id));
    expect(count?.value).toBe(2);
    const [eventAudit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.action, "inventory.supplier_exchange")),
      )
      .limit(1);
    expect(eventAudit?.metadata).toMatchObject({ mappingId: mapping.id, productId: product.id });
    await expect(
      service.recordReturnableEvent(context, {
        ...input,
        mappingId: crypto.randomUUID(),
        idempotencyKey: `returnable-unknown-${crypto.randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
