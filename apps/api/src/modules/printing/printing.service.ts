import {
  auditLogs,
  branches,
  integrationAccounts,
  kdsStations,
  printerDevices,
  printJobs,
  printRoutes,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { printJobStatuses as domainPrintJobStatuses, type PrintJobStatus } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { createIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";

export type CreatePrinterDeviceInput = {
  branchId: string;
  name: string;
  role: string;
  connectionType: string;
  address?: string | undefined;
  port?: number | undefined;
  paperWidth?: number | undefined;
  charactersPerLine?: number | undefined;
  config?: Record<string, unknown> | undefined;
};

export type CreatePrintRouteInput = {
  branchId: string;
  name: string;
  trigger: string;
  targetType: string;
  stationId?: string | undefined;
  productCategoryIds?: string[] | undefined;
  printerDeviceId: string;
  copies?: number | undefined;
  config?: Record<string, unknown> | undefined;
};

export type PrintJobFilter = {
  branchId?: string | undefined;
  status?: string | undefined;
};

export type ConfigureConnectorInput = {
  branchId: string;
  rotateKey?: boolean | undefined;
};

export type ConnectorHeartbeatInput = {
  version: string;
  hostname?: string | undefined;
  platform?: string | undefined;
  dryRun?: boolean | undefined;
  printerCount?: number | undefined;
};

const connectorProvider = "local_printer_connector";
const connectorScopes = ["print_jobs:read", "print_jobs:process"] as const;
const connectorOnlineWindowMs = 30_000;

@Injectable()
export class PrintingService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listDevices(context: TenantContext, branchId?: string) {
    const conditions: SQL<unknown>[] = [eq(printerDevices.tenantId, context.tenantId)];
    if (branchId) {
      conditions.push(eq(printerDevices.branchId, branchId));
    }

    return this.database.db
      .select()
      .from(printerDevices)
      .where(and(...conditions))
      .orderBy(printerDevices.name);
  }

  async createDevice(context: TenantContext, input: CreatePrinterDeviceInput) {
    await this.assertBranchForTenant(context, input.branchId);

    const [device] = await this.database.db
      .insert(printerDevices)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        role: input.role,
        connectionType: input.connectionType,
        address: input.address,
        port: input.port,
        paperWidth: input.paperWidth ?? 80,
        charactersPerLine: input.charactersPerLine ?? 48,
        config: input.config ?? {},
      })
      .returning();

    if (!device) {
      throw new Error("Failed to create printer device");
    }

    await this.audit(context, "printer.device_created", "printer_device", device.id, {
      branchId: input.branchId,
      role: input.role,
      connectionType: input.connectionType,
    });

    return device;
  }

  async listRoutes(context: TenantContext, branchId?: string) {
    const conditions: SQL<unknown>[] = [eq(printRoutes.tenantId, context.tenantId)];
    if (branchId) {
      conditions.push(eq(printRoutes.branchId, branchId));
    }

    return this.database.db
      .select({
        id: printRoutes.id,
        tenantId: printRoutes.tenantId,
        branchId: printRoutes.branchId,
        name: printRoutes.name,
        trigger: printRoutes.trigger,
        targetType: printRoutes.targetType,
        stationId: printRoutes.stationId,
        stationName: kdsStations.name,
        printerDeviceId: printRoutes.printerDeviceId,
        printerName: printerDevices.name,
        copies: printRoutes.copies,
        isActive: printRoutes.isActive,
        config: printRoutes.config,
        createdAt: printRoutes.createdAt,
      })
      .from(printRoutes)
      .innerJoin(printerDevices, eq(printerDevices.id, printRoutes.printerDeviceId))
      .leftJoin(kdsStations, eq(kdsStations.id, printRoutes.stationId))
      .where(and(...conditions))
      .orderBy(printRoutes.name);
  }

  async createRoute(context: TenantContext, input: CreatePrintRouteInput) {
    await this.assertBranchForTenant(context, input.branchId);

    const [printer] = await this.database.db
      .select()
      .from(printerDevices)
      .where(
        and(
          eq(printerDevices.tenantId, context.tenantId),
          eq(printerDevices.id, input.printerDeviceId),
          eq(printerDevices.branchId, input.branchId),
        ),
      )
      .limit(1);

    if (!printer) {
      throw new NotFoundException("Printer device not found for this branch");
    }

    if (input.stationId) {
      const [station] = await this.database.db
        .select({ id: kdsStations.id })
        .from(kdsStations)
        .where(
          and(
            eq(kdsStations.tenantId, context.tenantId),
            eq(kdsStations.branchId, input.branchId),
            eq(kdsStations.id, input.stationId),
          ),
        )
        .limit(1);

      if (!station) {
        throw new NotFoundException("KDS station not found for this branch");
      }
    }

    const [route] = await this.database.db
      .insert(printRoutes)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        trigger: input.trigger,
        targetType: input.targetType,
        stationId: input.stationId,
        productCategoryIds: input.productCategoryIds ?? [],
        printerDeviceId: input.printerDeviceId,
        copies: input.copies ?? 1,
        config: input.config ?? {},
      })
      .returning();

    if (!route) {
      throw new Error("Failed to create print route");
    }

    await this.audit(context, "printer.route_created", "print_route", route.id, {
      branchId: input.branchId,
      printerDeviceId: input.printerDeviceId,
    });

    return route;
  }

  async listJobs(context: TenantContext, filter: PrintJobFilter) {
    const conditions: SQL<unknown>[] = [eq(printJobs.tenantId, context.tenantId)];
    if (filter.branchId) {
      conditions.push(eq(printJobs.branchId, filter.branchId));
    }
    if (filter.status) {
      if (!domainPrintJobStatuses.includes(filter.status as PrintJobStatus)) {
        throw new BadRequestException("Invalid print job status");
      }
      conditions.push(eq(printJobs.status, filter.status as PrintJobStatus));
    }

    return this.database.db
      .select({
        id: printJobs.id,
        tenantId: printJobs.tenantId,
        branchId: printJobs.branchId,
        printerDeviceId: printJobs.printerDeviceId,
        printerName: printerDevices.name,
        printerAddress: printerDevices.address,
        printerPort: printerDevices.port,
        printerConfig: printerDevices.config,
        orderId: printJobs.orderId,
        kdsTicketId: printJobs.kdsTicketId,
        kind: printJobs.kind,
        status: printJobs.status,
        copies: printJobs.copies,
        attemptCount: printJobs.attemptCount,
        maxAttempts: printJobs.maxAttempts,
        renderedText: printJobs.renderedText,
        errorMessage: printJobs.errorMessage,
        printedAt: printJobs.printedAt,
        createdAt: printJobs.createdAt,
        payload: printJobs.payload,
      })
      .from(printJobs)
      .leftJoin(printerDevices, eq(printerDevices.id, printJobs.printerDeviceId))
      .where(and(...conditions))
      .orderBy(desc(printJobs.createdAt))
      .limit(80);
  }

  async retryJob(context: TenantContext, jobId: string) {
    const [job] = await this.findJob(context, jobId);
    if (!job) {
      throw new NotFoundException("Print job not found");
    }
    if (!["failed", "canceled"].includes(job.status)) {
      throw new ConflictException("Only failed or canceled print jobs can be retried");
    }

    const [updated] = await this.database.db
      .update(printJobs)
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(and(...this.jobConditions(context, jobId)))
      .returning();

    await this.audit(context, "printer.job_retried", "print_job", jobId, {});
    return updated;
  }

  async reprintJob(context: TenantContext, jobId: string, reason: string) {
    const [job] = await this.findJob(context, jobId);
    if (!job) {
      throw new NotFoundException("Print job not found");
    }

    const [reprint] = await this.database.db
      .insert(printJobs)
      .values({
        tenantId: context.tenantId,
        branchId: job.branchId,
        printerDeviceId: job.printerDeviceId,
        printRouteId: job.printRouteId,
        kdsTicketId: job.kdsTicketId,
        orderId: job.orderId,
        requestedByUserId: context.userId,
        kind: job.kind,
        status: "pending",
        idempotencyKey: `reprint:${job.id}:${Date.now()}`,
        copies: job.copies,
        payload: { ...readObject(job.payload), reprintOf: job.id, reason },
        renderedText: job.renderedText,
      })
      .returning();

    if (!reprint) {
      throw new Error("Failed to create reprint job");
    }

    await this.audit(context, "printer.job_reprinted", "print_job", reprint.id, {
      originalJobId: job.id,
      reason,
    });

    return reprint;
  }

  async startJob(context: TenantContext, jobId: string) {
    return this.transitionJob(context, jobId, "printing");
  }

  async completeJob(context: TenantContext, jobId: string) {
    return this.transitionJob(context, jobId, "printed");
  }

  async failJob(context: TenantContext, jobId: string, errorMessage: string) {
    const [job] = await this.findJob(context, jobId);
    if (!job) {
      throw new NotFoundException("Print job not found");
    }

    const [updated] = await this.database.db
      .update(printJobs)
      .set({
        status: "failed",
        errorMessage,
        attemptCount: job.attemptCount + 1,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...this.jobConditions(context, jobId)))
      .returning();

    return updated;
  }

  async configureConnector(context: TenantContext, input: ConfigureConnectorInput) {
    await this.assertBranchForTenant(context, input.branchId);

    const [existingAccount] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, connectorProvider),
        ),
      )
      .limit(1);

    const shouldIssueKey = !existingAccount?.apiKeyHash || input.rotateKey === true;
    const issuedKey = shouldIssueKey ? createIntegrationApiKey(connectorProvider) : undefined;
    const config = {
      branchId: input.branchId,
      scopes: [...connectorScopes],
      credentialType: "local_connector",
    };

    const [account] = await this.database.db
      .insert(integrationAccounts)
      .values({
        tenantId: context.tenantId,
        provider: connectorProvider,
        status: "active",
        config,
        secretRef: "GIROMESA_CONNECTOR_TOKEN",
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
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
      });

    if (!account) {
      throw new Error("Failed to configure local printer connector");
    }

    await this.audit(
      context,
      issuedKey ? "printer.connector_key_rotated" : "printer.connector_configured",
      "integration_account",
      account.id,
      {
        provider: connectorProvider,
        branchId: input.branchId,
        keyLastFour: issuedKey?.lastFour ?? account.apiKeyLastFour,
      },
    );

    return {
      ...this.mapConnectorAccount(account),
      apiKey: issuedKey?.token,
      apiKeyReturnedOnce: Boolean(issuedKey),
    };
  }

  async getConnectorConfig(context: TenantContext) {
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
          eq(integrationAccounts.provider, connectorProvider),
        ),
      )
      .limit(1);

    if (!account) {
      return {
        provider: connectorProvider,
        status: "not_configured",
        branchId: null,
        scopes: [],
        hasApiKey: false,
      };
    }

    return this.mapConnectorAccount(account);
  }

  async recordConnectorHeartbeat(context: TenantContext, input: ConnectorHeartbeatInput) {
    if (!context.branchId) {
      throw new ConflictException("Connector context must be branch scoped");
    }

    const [account] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, connectorProvider),
          eq(integrationAccounts.status, "active"),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundException("Local printer connector is not configured");
    }

    const config = {
      ...account.config,
      lastHeartbeat: {
        at: new Date().toISOString(),
        version: input.version,
        hostname: input.hostname,
        platform: input.platform,
        dryRun: input.dryRun,
        printerCount: input.printerCount,
      },
    };

    const [updated] = await this.database.db
      .update(integrationAccounts)
      .set({
        config,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationAccounts.id, account.id))
      .returning({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
        lastSyncAt: integrationAccounts.lastSyncAt,
      });

    if (!updated) {
      throw new Error("Failed to record connector heartbeat");
    }

    return this.mapConnectorAccount(updated);
  }

  async revokeConnector(context: TenantContext) {
    const [account] = await this.database.db
      .update(integrationAccounts)
      .set({
        status: "disabled",
        apiKeyHash: null,
        apiKeyLastFour: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, connectorProvider),
        ),
      )
      .returning({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        status: integrationAccounts.status,
        config: integrationAccounts.config,
        apiKeyLastFour: integrationAccounts.apiKeyLastFour,
        apiKeyCreatedAt: integrationAccounts.apiKeyCreatedAt,
        lastSyncAt: integrationAccounts.lastSyncAt,
      });

    if (!account) {
      throw new NotFoundException("Local printer connector is not configured");
    }

    await this.audit(context, "printer.connector_key_revoked", "integration_account", account.id, {
      provider: connectorProvider,
    });

    return this.mapConnectorAccount(account);
  }

  private async transitionJob(context: TenantContext, jobId: string, status: PrintJobStatus) {
    if (!domainPrintJobStatuses.includes(status)) {
      throw new BadRequestException("Invalid print job status");
    }

    const [updated] = await this.database.db
      .update(printJobs)
      .set({
        status,
        printedAt: status === "printed" ? new Date() : undefined,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...this.jobConditions(context, jobId)))
      .returning();

    if (!updated) {
      throw new NotFoundException("Print job not found");
    }

    return updated;
  }

  private findJob(context: TenantContext, jobId: string) {
    return this.database.db
      .select()
      .from(printJobs)
      .where(and(...this.jobConditions(context, jobId)))
      .limit(1);
  }

  private async assertBranchForTenant(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);

    if (!branch) {
      throw new NotFoundException("Branch not found");
    }
  }

  private jobConditions(context: TenantContext, jobId: string) {
    const conditions: SQL<unknown>[] = [
      eq(printJobs.tenantId, context.tenantId),
      eq(printJobs.id, jobId),
    ];
    if (context.branchId) {
      conditions.push(eq(printJobs.branchId, context.branchId));
    }
    return conditions;
  }

  private async audit(
    context: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType,
      entityId,
      metadata,
    });
  }

  private mapConnectorAccount(account: {
    id: string;
    provider: string;
    status: string;
    config: Record<string, unknown>;
    apiKeyLastFour: string | null;
    apiKeyCreatedAt: Date | null;
    lastSyncAt?: Date | null;
  }) {
    return {
      id: account.id,
      provider: account.provider,
      status: account.status,
      branchId: typeof account.config.branchId === "string" ? account.config.branchId : null,
      scopes: Array.isArray(account.config.scopes) ? account.config.scopes : [],
      apiKeyLastFour: account.apiKeyLastFour,
      apiKeyCreatedAt: account.apiKeyCreatedAt,
      hasApiKey: Boolean(account.apiKeyLastFour),
      lastSyncAt: account.lastSyncAt ?? null,
      heartbeat: readObject(account.config.lastHeartbeat),
      online: Boolean(
        account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() <= connectorOnlineWindowMs,
      ),
    };
  }
}

function readObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
