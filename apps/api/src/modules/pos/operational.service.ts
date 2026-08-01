import { createHash, randomBytes } from "node:crypto";
import {
  auditLogs,
  branchBusinessHourExceptions,
  branchBusinessHours,
  branchOperationalSettings,
  operationalDevices,
  operationalEvents,
  operationalPins,
  userOperationalPreferences,
} from "@giromesa/db";
import type {
  BranchOperationalSettings,
  BusinessHourException,
  KdsInputMode,
  TenantContext,
  ThemeMode,
  WeeklyBusinessHour,
} from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../../common/password";
import { DatabaseService } from "../database/database.service";
import { CashService } from "./cash.service";
import { OrdersService } from "./orders.service";
import { PosRepository } from "./pos.repository";
import { ShiftService } from "./shift.service";

type OperationalSettingsInput = {
  cleaningMode?: BranchOperationalSettings["cleaningMode"] | undefined;
  allowWaiterPayments?: boolean | undefined;
  defaultTheme?: BranchOperationalSettings["defaultTheme"] | undefined;
  defaultKdsInputMode?: BranchOperationalSettings["defaultKdsInputMode"] | undefined;
  kdsShortcuts?: BranchOperationalSettings["kdsShortcuts"] | undefined;
};

const defaultKdsShortcuts = {
  refresh: "r",
  sound: "s",
  fullscreen: "f",
  advance: " ",
  up: "ArrowUp",
  down: "ArrowDown",
};

@Injectable()
export class OperationalService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PosRepository) private readonly posRepository: PosRepository,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(CashService) private readonly cashService: CashService,
    @Inject(ShiftService) private readonly shiftService: ShiftService,
  ) {}

  async getSettings(context: TenantContext, branchId: string): Promise<BranchOperationalSettings> {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const [settings] = await this.database.db
      .select()
      .from(branchOperationalSettings)
      .where(
        and(
          eq(branchOperationalSettings.tenantId, context.tenantId),
          eq(branchOperationalSettings.branchId, branchId),
        ),
      )
      .limit(1);
    return settings
      ? {
          branchId,
          cleaningMode: settings.cleaningMode,
          allowWaiterPayments: settings.allowWaiterPayments,
          defaultTheme: settings.defaultTheme,
          defaultKdsInputMode: settings.defaultKdsInputMode,
          kdsShortcuts: settings.kdsShortcuts ?? defaultKdsShortcuts,
        }
      : {
          branchId,
          cleaningMode: "manual",
          allowWaiterPayments: false,
          defaultTheme: "dark",
          defaultKdsInputMode: "hybrid",
          kdsShortcuts: defaultKdsShortcuts,
        };
  }

  async updateSettings(context: TenantContext, branchId: string, input: OperationalSettingsInput) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    return this.database.db.transaction(async (tx) => {
      const [settings] = await tx
        .insert(branchOperationalSettings)
        .values({ tenantId: context.tenantId, branchId, ...input })
        .onConflictDoUpdate({
          target: [branchOperationalSettings.tenantId, branchOperationalSettings.branchId],
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      if (!settings) throw new BadRequestException("Unable to save operational settings");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "branch.operational_settings_updated",
        entityType: "branch",
        entityId: branchId,
        metadata: input,
      });
      return settings;
    });
  }

  async getBusinessHours(context: TenantContext, branchId: string) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const [weekly, exceptions] = await Promise.all([
      this.database.db
        .select()
        .from(branchBusinessHours)
        .where(
          and(
            eq(branchBusinessHours.tenantId, context.tenantId),
            eq(branchBusinessHours.branchId, branchId),
          ),
        )
        .orderBy(asc(branchBusinessHours.weekday), asc(branchBusinessHours.sortOrder)),
      this.database.db
        .select()
        .from(branchBusinessHourExceptions)
        .where(
          and(
            eq(branchBusinessHourExceptions.tenantId, context.tenantId),
            eq(branchBusinessHourExceptions.branchId, branchId),
          ),
        )
        .orderBy(asc(branchBusinessHourExceptions.date)),
    ]);
    return { branchId, weekly, exceptions };
  }

  async replaceBusinessHours(
    context: TenantContext,
    branchId: string,
    input: { weekly: WeeklyBusinessHour[]; exceptions: BusinessHourException[] },
  ) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    return this.database.db.transaction(async (tx) => {
      await tx
        .delete(branchBusinessHours)
        .where(
          and(
            eq(branchBusinessHours.tenantId, context.tenantId),
            eq(branchBusinessHours.branchId, branchId),
          ),
        );
      await tx
        .delete(branchBusinessHourExceptions)
        .where(
          and(
            eq(branchBusinessHourExceptions.tenantId, context.tenantId),
            eq(branchBusinessHourExceptions.branchId, branchId),
          ),
        );
      if (input.weekly.length > 0) {
        await tx.insert(branchBusinessHours).values(
          input.weekly.map((slot) => ({
            tenantId: context.tenantId,
            branchId,
            ...slot,
          })),
        );
      }
      if (input.exceptions.length > 0) {
        await tx.insert(branchBusinessHourExceptions).values(
          input.exceptions.map((exception) => ({
            tenantId: context.tenantId,
            branchId,
            date: exception.date,
            isClosed: exception.isClosed,
            intervals: exception.intervals,
            reason: exception.reason ?? null,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "branch.business_hours_replaced",
        entityType: "branch",
        entityId: branchId,
        metadata: { weeklySlots: input.weekly.length, exceptions: input.exceptions.length },
      });
      return { branchId, ...input };
    });
  }

  async savePreferences(
    context: TenantContext,
    branchId: string,
    input: { theme: ThemeMode; kdsInput: KdsInputMode },
  ) {
    const userId = requireUserId(context);
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const [preferences] = await this.database.db
      .insert(userOperationalPreferences)
      .values({ tenantId: context.tenantId, branchId, userId, ...input })
      .onConflictDoUpdate({
        target: [
          userOperationalPreferences.tenantId,
          userOperationalPreferences.branchId,
          userOperationalPreferences.userId,
        ],
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    return preferences;
  }

  async setPersonalPin(context: TenantContext, branchId: string, pin: string) {
    const userId = requireUserId(context);
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    const pinHash = await hashPassword(pin);
    const [record] = await this.database.db
      .insert(operationalPins)
      .values({ tenantId: context.tenantId, branchId, userId, pinHash })
      .onConflictDoUpdate({
        target: [operationalPins.tenantId, operationalPins.branchId, operationalPins.userId],
        set: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
          revokedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: operationalPins.id, updatedAt: operationalPins.updatedAt });
    await this.posRepository.insertAuditLog(context, {
      branchId,
      userId,
      requestId: context.requestId,
      action: "operator.pin_updated",
      entityType: "user",
      entityId: userId,
      metadata: {},
    });
    return record;
  }

  async registerDevice(
    context: TenantContext,
    input: {
      branchId: string;
      name: string;
      kind: string;
      theme: ThemeMode;
      kdsInput: KdsInputMode;
    },
  ) {
    const userId = requireUserId(context);
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await this.database.db
      .insert(operationalDevices)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        kind: input.kind,
        tokenHash,
        theme: input.theme,
        kdsInput: input.kdsInput,
        createdByUserId: userId,
      })
      .returning({
        id: operationalDevices.id,
        branchId: operationalDevices.branchId,
        name: operationalDevices.name,
        kind: operationalDevices.kind,
        status: operationalDevices.status,
        theme: operationalDevices.theme,
        kdsInput: operationalDevices.kdsInput,
      });
    if (!device) throw new BadRequestException("Unable to register operational device");
    await this.posRepository.insertAuditLog(context, {
      branchId: input.branchId,
      userId,
      requestId: context.requestId,
      action: "operational_device.registered",
      entityType: "operational_device",
      entityId: device.id,
      metadata: { name: device.name, kind: device.kind },
    });
    return { ...device, token };
  }

  async listDevices(context: TenantContext, branchId?: string) {
    const conditions = [eq(operationalDevices.tenantId, context.tenantId)];
    if (branchId) conditions.push(eq(operationalDevices.branchId, branchId));
    return this.database.db
      .select({
        id: operationalDevices.id,
        branchId: operationalDevices.branchId,
        name: operationalDevices.name,
        kind: operationalDevices.kind,
        status: operationalDevices.status,
        theme: operationalDevices.theme,
        kdsInput: operationalDevices.kdsInput,
        lastSeenAt: operationalDevices.lastSeenAt,
        createdAt: operationalDevices.createdAt,
      })
      .from(operationalDevices)
      .where(and(...conditions))
      .orderBy(asc(operationalDevices.name));
  }

  async revokeDevice(context: TenantContext, deviceId: string) {
    const userId = requireUserId(context);
    const [device] = await this.database.db
      .update(operationalDevices)
      .set({
        status: "revoked",
        revokedByUserId: userId,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(operationalDevices.tenantId, context.tenantId), eq(operationalDevices.id, deviceId)),
      )
      .returning({
        id: operationalDevices.id,
        branchId: operationalDevices.branchId,
        status: operationalDevices.status,
      });
    if (!device) throw new ConflictException("Operational device not found");
    await this.posRepository.insertAuditLog(context, {
      branchId: device.branchId,
      userId,
      requestId: context.requestId,
      action: "operational_device.revoked",
      entityType: "operational_device",
      entityId: device.id,
      metadata: {},
    });
    return device;
  }

  async verifyPersonalPin(context: TenantContext, branchId: string, pin: string) {
    const userId = requireUserId(context);
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    return this.database.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(operationalPins)
        .where(
          and(
            eq(operationalPins.tenantId, context.tenantId),
            eq(operationalPins.branchId, branchId),
            eq(operationalPins.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!record || record.revokedAt)
        throw new UnauthorizedException("PIN não configurado ou revogado");
      if (record.lockedUntil && record.lockedUntil > new Date()) {
        throw new UnauthorizedException("PIN temporariamente bloqueado");
      }
      const valid = await verifyPassword(record.pinHash, pin);
      if (!valid) {
        const failedAttempts = record.failedAttempts + 1;
        const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
        await tx
          .update(operationalPins)
          .set({ failedAttempts, lockedUntil, updatedAt: new Date() })
          .where(eq(operationalPins.id, record.id));
        await tx.insert(auditLogs).values({
          tenantId: context.tenantId,
          branchId,
          userId,
          requestId: context.requestId,
          action: lockedUntil ? "operator.pin_locked" : "operator.pin_failed",
          entityType: "user",
          entityId: userId,
          metadata: { failedAttempts },
        });
        throw new UnauthorizedException(
          lockedUntil ? "PIN bloqueado por tentativas" : "PIN inválido",
        );
      }
      await tx
        .update(operationalPins)
        .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(operationalPins.id, record.id));
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId,
        requestId: context.requestId,
        action: "operator.pin_verified",
        entityType: "user",
        entityId: userId,
        metadata: {},
      });
      return { valid: true, branchId };
    });
  }

  async listEvents(context: TenantContext, branchId: string, afterVersion: number, limit: number) {
    await this.posRepository.ensureBranchBelongsToTenant(context, branchId);
    return this.database.db
      .select()
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.tenantId, context.tenantId),
          eq(operationalEvents.branchId, branchId),
          gt(operationalEvents.version, afterVersion),
        ),
      )
      .orderBy(asc(operationalEvents.version))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  async getSession(
    context: TenantContext,
    input: { branchId: string; tableId?: string | undefined; orderId?: string | undefined },
  ) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    const shouldLoadOrder = Boolean(input.tableId || input.orderId);
    const [shift, cash, order, settings, [latestEvent]] = await Promise.all([
      this.shiftService.getCurrentShift(context, input.branchId),
      this.cashService.getCurrentCashSession(context, input.branchId),
      shouldLoadOrder ? this.ordersService.getActiveOrder(context, input) : Promise.resolve(null),
      this.getSettings(context, input.branchId),
      this.database.db
        .select({ version: operationalEvents.version })
        .from(operationalEvents)
        .where(
          and(
            eq(operationalEvents.tenantId, context.tenantId),
            eq(operationalEvents.branchId, input.branchId),
          ),
        )
        .orderBy(desc(operationalEvents.version))
        .limit(1),
    ]);
    return {
      branchId: input.branchId,
      shift: shift.shift,
      cash: cash.session,
      order,
      settings,
      latestEventVersion: latestEvent?.version ?? 0,
    };
  }
}

function requireUserId(context: TenantContext) {
  if (!context.userId) throw new BadRequestException("Authenticated user is required");
  return context.userId;
}
