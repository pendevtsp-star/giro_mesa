import { auditLogs, deliveryOrders, orders } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditMetadata } from "../../common/sensitive-data";
import { DatabaseService } from "../database/database.service";

type CreateDeliveryInput = {
  orderId: string;
  channel: string;
  customerName?: string | undefined;
  customerPhone?: string | undefined;
  deliveryAddress?: string | undefined;
  deliveryFee?: number | undefined;
  estimatedMinutes?: number | undefined;
  riderName?: string | undefined;
  riderPhone?: string | undefined;
  notes?: string | undefined;
  externalCorrelationKey?: string | undefined;
};

type DeliveryStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "canceled";

@Injectable()
export class DeliveryService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createDelivery(context: TenantContext, input: CreateDeliveryInput) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, input.orderId)))
        .limit(1);

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (input.channel === "ifood" && !input.externalCorrelationKey) {
        throw new BadRequestException("Manual iFood entry requires an external correlation key");
      }
      const correlationPrefix = input.externalCorrelationKey
        ? `[external:${input.channel}:${input.externalCorrelationKey}]`
        : null;
      if (correlationPrefix) {
        const correlationLock = `${context.tenantId}:${input.channel}:${input.externalCorrelationKey}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${correlationLock}))`);
        const [existing] = await tx
          .select()
          .from(deliveryOrders)
          .where(
            and(
              eq(deliveryOrders.tenantId, context.tenantId),
              eq(deliveryOrders.channel, input.channel),
              sql`${deliveryOrders.notes} like ${`${correlationPrefix}%`}`,
            ),
          )
          .limit(1);
        if (existing) return { ...existing, duplicate: true };
      }

      const [delivery] = await tx
        .insert(deliveryOrders)
        .values({
          tenantId: context.tenantId,
          orderId: input.orderId,
          channel: input.channel,
          status: "pending",
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryFee: input.deliveryFee ?? 0,
          estimatedMinutes: input.estimatedMinutes ?? null,
          riderName: input.riderName ?? null,
          riderPhone: input.riderPhone ?? null,
          notes: correlationPrefix
            ? `${correlationPrefix} ${input.notes ?? ""}`.trim()
            : (input.notes ?? null),
        })
        .returning();

      if (!delivery) {
        throw new Error("Failed to create delivery order");
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "delivery.created",
        entityType: "delivery_order",
        entityId: delivery.id,
        metadata: auditMetadata({
          orderId: input.orderId,
          channel: input.channel,
          externalCorrelationKey: input.externalCorrelationKey ?? null,
        }),
      });

      return delivery;
    });
  }

  async updateDeliveryStatus(context: TenantContext, deliveryId: string, status: DeliveryStatus) {
    return this.database.db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(deliveryOrders)
        .where(
          and(eq(deliveryOrders.tenantId, context.tenantId), eq(deliveryOrders.id, deliveryId)),
        )
        .limit(1);

      if (!delivery) {
        throw new NotFoundException("Delivery order not found");
      }

      if (delivery.status === "delivered" || delivery.status === "canceled") {
        throw new BadRequestException(`Cannot update delivery in "${delivery.status}" status`);
      }

      const [updated] = await tx
        .update(deliveryOrders)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          and(eq(deliveryOrders.tenantId, context.tenantId), eq(deliveryOrders.id, deliveryId)),
        )
        .returning();

      if (!updated) {
        throw new Error("Failed to update delivery status");
      }

      const [order] = await tx
        .select({ branchId: orders.branchId })
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, delivery.orderId)))
        .limit(1);

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order?.branchId ?? null,
        userId: context.userId,
        requestId: context.requestId,
        action: "delivery.status_updated",
        entityType: "delivery_order",
        entityId: deliveryId,
        metadata: {
          previousStatus: delivery.status,
          newStatus: status,
          orderId: delivery.orderId,
        },
      });

      return updated;
    });
  }

  async listDeliveries(context: TenantContext, branchId: string, status?: DeliveryStatus) {
    const conditions = [
      eq(deliveryOrders.tenantId, context.tenantId),
      eq(orders.branchId, branchId),
    ];

    if (status) {
      conditions.push(eq(deliveryOrders.status, status));
    }

    const rows = await this.database.db
      .select({
        id: deliveryOrders.id,
        orderId: deliveryOrders.orderId,
        channel: deliveryOrders.channel,
        status: deliveryOrders.status,
        customerName: deliveryOrders.customerName,
        customerPhone: deliveryOrders.customerPhone,
        deliveryAddress: deliveryOrders.deliveryAddress,
        deliveryFee: deliveryOrders.deliveryFee,
        estimatedMinutes: deliveryOrders.estimatedMinutes,
        riderName: deliveryOrders.riderName,
        riderPhone: deliveryOrders.riderPhone,
        notes: deliveryOrders.notes,
        createdAt: deliveryOrders.createdAt,
        updatedAt: deliveryOrders.updatedAt,
        orderStatus: orders.status,
        totalCents: orders.totalCents,
      })
      .from(deliveryOrders)
      .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
      .where(and(...conditions))
      .orderBy(desc(deliveryOrders.createdAt));

    return rows;
  }

  async getDelivery(context: TenantContext, deliveryId: string) {
    const [delivery] = await this.database.db
      .select({
        id: deliveryOrders.id,
        orderId: deliveryOrders.orderId,
        channel: deliveryOrders.channel,
        status: deliveryOrders.status,
        customerName: deliveryOrders.customerName,
        customerPhone: deliveryOrders.customerPhone,
        deliveryAddress: deliveryOrders.deliveryAddress,
        deliveryFee: deliveryOrders.deliveryFee,
        estimatedMinutes: deliveryOrders.estimatedMinutes,
        riderName: deliveryOrders.riderName,
        riderPhone: deliveryOrders.riderPhone,
        notes: deliveryOrders.notes,
        createdAt: deliveryOrders.createdAt,
        updatedAt: deliveryOrders.updatedAt,
        orderStatus: orders.status,
        totalCents: orders.totalCents,
      })
      .from(deliveryOrders)
      .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
      .where(and(eq(deliveryOrders.tenantId, context.tenantId), eq(deliveryOrders.id, deliveryId)))
      .limit(1);

    if (!delivery) {
      throw new NotFoundException("Delivery order not found");
    }

    return delivery;
  }

  async cancelDelivery(context: TenantContext, deliveryId: string, reason: string) {
    return this.database.db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(deliveryOrders)
        .where(
          and(eq(deliveryOrders.tenantId, context.tenantId), eq(deliveryOrders.id, deliveryId)),
        )
        .limit(1);

      if (!delivery) {
        throw new NotFoundException("Delivery order not found");
      }

      if (delivery.status === "delivered") {
        throw new BadRequestException("Cannot cancel a delivery that has already been delivered");
      }

      if (delivery.status === "canceled") {
        throw new BadRequestException("Delivery is already canceled");
      }

      const [updated] = await tx
        .update(deliveryOrders)
        .set({
          status: "canceled",
          notes: reason,
          updatedAt: new Date(),
        })
        .where(
          and(eq(deliveryOrders.tenantId, context.tenantId), eq(deliveryOrders.id, deliveryId)),
        )
        .returning();

      if (!updated) {
        throw new Error("Failed to cancel delivery");
      }

      const [order] = await tx
        .select({ branchId: orders.branchId })
        .from(orders)
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, delivery.orderId)))
        .limit(1);

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: order?.branchId ?? null,
        userId: context.userId,
        requestId: context.requestId,
        action: "delivery.canceled",
        entityType: "delivery_order",
        entityId: deliveryId,
        metadata: {
          previousStatus: delivery.status,
          reason,
          orderId: delivery.orderId,
        },
      });

      return updated;
    });
  }
}
