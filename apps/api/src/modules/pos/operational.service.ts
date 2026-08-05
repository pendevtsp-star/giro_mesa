import { createHash, randomBytes } from "node:crypto";
import {
  auditLogs,
  branchBusinessHourExceptions,
  branchBusinessHours,
  branchOperationalSettings,
  kdsStations,
  operationalDevices,
  operationalEvents,
  operationalPins,
  printerDevices,
  printRoutes,
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
import { isProductionRouteCompatible } from "./device-routing";
import { findOperationReceipt } from "./operation-receipts";
import { OrdersService } from "./orders.service";
import { PosRepository } from "./pos.repository";
import { ShiftService } from "./shift.service";

type OperationalSettingsInput = {
  cleaningMode?: BranchOperationalSettings["cleaningMode"] | undefined;
  allowWaiterPayments?: boolean | undefined;
  defaultTheme?: BranchOperationalSettings["defaultTheme"] | undefined;
  defaultKdsInputMode?: BranchOperationalSettings["defaultKdsInputMode"] | undefined;
  kdsShortcuts?: BranchOperationalSettings["kdsShortcuts"] | undefined;
  waiterResponsibilityPolicy?: BranchOperationalSettings["waiterResponsibilityPolicy"] | undefined;
};

const defaultKdsShortcuts = {
  refresh: "r",
  sound: "s",
  fullscreen: "f",
  advance: " ",
  return: "Backspace",
  recall: "l",
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
          kdsShortcuts: { ...defaultKdsShortcuts, ...settings.kdsShortcuts },
          waiterResponsibilityPolicy: settings.waiterResponsibilityPolicy,
        }
      : {
          branchId,
          cleaningMode: "manual",
          allowWaiterPayments: false,
          defaultTheme: "dark",
          defaultKdsInputMode: "hybrid",
          kdsShortcuts: defaultKdsShortcuts,
          waiterResponsibilityPolicy: "collaborative",
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
      initialMode: "table" | "counter" | "bar" | "cashier" | "kds" | "expedition";
      stationId?: string | undefined;
      printerDeviceId?: string | undefined;
      allowModeSwitch: boolean;
    },
  ) {
    const userId = requireUserId(context);
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    await this.assertDeviceRouting(context, input);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await this.database.db
      .insert(operationalDevices)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        kind: input.kind,
        initialMode: input.initialMode,
        stationId: input.stationId,
        printerDeviceId: input.printerDeviceId,
        allowModeSwitch: input.allowModeSwitch,
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
        initialMode: operationalDevices.initialMode,
        stationId: operationalDevices.stationId,
        printerDeviceId: operationalDevices.printerDeviceId,
        allowModeSwitch: operationalDevices.allowModeSwitch,
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
      metadata: { name: device.name, kind: device.kind, initialMode: device.initialMode },
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
        initialMode: operationalDevices.initialMode,
        stationId: operationalDevices.stationId,
        printerDeviceId: operationalDevices.printerDeviceId,
        allowModeSwitch: operationalDevices.allowModeSwitch,
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

  async activateDevice(context: TenantContext, token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await this.database.db
      .select()
      .from(operationalDevices)
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.tokenHash, tokenHash),
          eq(operationalDevices.status, "active"),
          context.branchId ? eq(operationalDevices.branchId, context.branchId) : undefined,
        ),
      )
      .limit(1);
    if (!device) throw new UnauthorizedException("Token de dispositivo inválido para esta filial");
    await this.database.db
      .update(operationalDevices)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.id, device.id),
        ),
      );
    await this.posRepository.insertAuditLog(context, {
      branchId: device.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "operational_device.activated",
      entityType: "operational_device",
      entityId: device.id,
      metadata: { name: device.name, initialMode: device.initialMode },
    });
    return deviceProfile(device);
  }

  async resolveDevice(context: TenantContext, token: string | undefined) {
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await this.database.db
      .select()
      .from(operationalDevices)
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.tokenHash, tokenHash),
          eq(operationalDevices.status, "active"),
          context.branchId ? eq(operationalDevices.branchId, context.branchId) : undefined,
        ),
      )
      .limit(1);
    if (!device) return null;
    await this.database.db
      .update(operationalDevices)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(operationalDevices.tenantId, context.tenantId),
          eq(operationalDevices.id, device.id),
        ),
      );
    return deviceProfile(device);
  }

  private async assertDeviceRouting(
    context: TenantContext,
    input: {
      branchId: string;
      kind: string;
      initialMode: string;
      stationId?: string | undefined;
      printerDeviceId?: string | undefined;
    },
  ) {
    const requiresProductionProfile =
      input.kind === "kds" ||
      input.kind === "expedition" ||
      input.initialMode === "kds" ||
      input.initialMode === "expedition";
    if (requiresProductionProfile && (!input.stationId || !input.printerDeviceId)) {
      throw new BadRequestException("KDS e expedição exigem estação e impressora de contingência");
    }
    if (!input.stationId && !input.printerDeviceId) return;
    if (!input.stationId || !input.printerDeviceId) {
      throw new BadRequestException(
        "Informe estação e impressora juntas para o perfil do dispositivo",
      );
    }

    const [station, printer, route] = await Promise.all([
      this.database.db
        .select({
          id: kdsStations.id,
          isActive: kdsStations.isActive,
          categories: kdsStations.productCategoryIds,
        })
        .from(kdsStations)
        .where(
          and(
            eq(kdsStations.tenantId, context.tenantId),
            eq(kdsStations.branchId, input.branchId),
            eq(kdsStations.id, input.stationId),
          ),
        )
        .limit(1),
      this.database.db
        .select({ id: printerDevices.id, isActive: printerDevices.isActive })
        .from(printerDevices)
        .where(
          and(
            eq(printerDevices.tenantId, context.tenantId),
            eq(printerDevices.branchId, input.branchId),
            eq(printerDevices.id, input.printerDeviceId),
          ),
        )
        .limit(1),
      this.database.db
        .select({
          id: printRoutes.id,
          tenantId: printRoutes.tenantId,
          branchId: printRoutes.branchId,
          trigger: printRoutes.trigger,
          targetType: printRoutes.targetType,
          productCategoryIds: printRoutes.productCategoryIds,
        })
        .from(printRoutes)
        .where(
          and(
            eq(printRoutes.tenantId, context.tenantId),
            eq(printRoutes.branchId, input.branchId),
            eq(printRoutes.stationId, input.stationId),
            eq(printRoutes.printerDeviceId, input.printerDeviceId),
            eq(printRoutes.isActive, true),
          ),
        )
        .limit(1),
    ]);
    const selectedStation = station[0];
    const selectedRoute = route[0];
    if (!selectedStation?.isActive || !printer[0]?.isActive || !selectedRoute) {
      throw new BadRequestException(
        "Configure uma estação ativa e sua rota de impressão antes de ativar o dispositivo",
      );
    }
    if (selectedStation.categories.length === 0) {
      throw new BadRequestException(
        "A estação precisa ter ao menos uma categoria de produto configurada",
      );
    }
    if (
      !isProductionRouteCompatible(
        {
          tenantId: context.tenantId,
          branchId: input.branchId,
          stationCategoryIds: selectedStation.categories,
        },
        selectedRoute,
      )
    ) {
      throw new BadRequestException(
        "A rota térmica precisa ser de produção e cobrir todas as categorias da estação",
      );
    }
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

  async getReceipt(
    context: TenantContext,
    input: { branchId: string; scope: string; idempotencyKey: string },
  ) {
    await this.posRepository.ensureBranchBelongsToTenant(context, input.branchId);
    return findOperationReceipt(this.database.db, {
      tenantId: context.tenantId,
      ...input,
    });
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

function deviceProfile(device: typeof operationalDevices.$inferSelect) {
  return {
    id: device.id,
    branchId: device.branchId,
    name: device.name,
    kind: device.kind,
    initialMode: device.initialMode,
    stationId: device.stationId,
    printerDeviceId: device.printerDeviceId,
    allowModeSwitch: device.allowModeSwitch,
    theme: device.theme,
    kdsInput: device.kdsInput,
  };
}
