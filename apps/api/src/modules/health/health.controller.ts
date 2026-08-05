import { Controller, Get, Headers, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { HeaderRecord } from "../../common/http";
import { getMetricsAsText } from "../../common/metrics";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { InventoryService } from "../inventory/inventory.service";
import { PosService } from "../pos/pos.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(InventoryService) readonly _inventoryService: InventoryService,
    @Inject(PosService) readonly _posService: PosService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "giromesa-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    try {
      await this.database.db.execute(sql`select 1`);
      return {
        status: "ok",
        service: "giromesa-api",
        checks: { database: "ok" },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
        service: "giromesa-api",
        checks: { database: "unavailable" },
      });
    }
  }

  @Get("detailed")
  async getDetailedHealth(@Headers() headers: HeaderRecord) {
    await this.requirePlatformAccess(headers);
    const checks: Record<string, { status: string; latencyMs?: number }> = {};
    let overallStatus = "ok";

    // Database check
    const dbStart = Date.now();
    try {
      await this.database.db.execute(sql`select 1`);
      checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: "unavailable", latencyMs: Date.now() - dbStart };
      overallStatus = "degraded";
    }

    return {
      status: overallStatus,
      service: "giromesa-api",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("metrics")
  async getMetrics(@Headers() headers: HeaderRecord) {
    await this.requirePlatformAccess(headers);
    return getMetricsAsText();
  }

  @Get("alerts")
  async getAlerts(@Headers() headers: HeaderRecord) {
    await this.requirePlatformAccess(headers);
    const alerts: Array<{
      type: string;
      severity: "critical" | "warning";
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Check for low stock items
    try {
      const inventoryAlerts = await this.database.db.execute(sql`
        SELECT
          i.id,
          i.name,
          i.min_quantity,
          COALESCE(SUM(sm.quantity), 0) as current_quantity
        FROM inventory_items i
        LEFT JOIN stock_movements sm ON sm.inventory_item_id = i.id
        GROUP BY i.id
        HAVING COALESCE(SUM(sm.quantity), 0) < i.min_quantity
      `);

      if (inventoryAlerts.rows.length > 0) {
        alerts.push({
          type: "low_stock",
          severity: "warning",
          message: `${inventoryAlerts.rows.length} items below minimum stock level`,
          details: {
            items: inventoryAlerts.rows.map((row) => ({
              id: row.id,
              name: row.name,
              minQuantity: row.min_quantity,
              currentQuantity: row.current_quantity,
            })),
          },
        });
      }
    } catch {
      // Ignore errors in alert checks
    }

    // Check for failed fiscal documents
    try {
      const failedFiscal = await this.database.db.execute(sql`
        SELECT COUNT(*) as count
        FROM fiscal_documents
        WHERE status IN ('failed', 'error')
      `);

      const count = Number(failedFiscal.rows[0]?.count ?? 0);
      if (count > 0) {
        alerts.push({
          type: "failed_fiscal",
          severity: "critical",
          message: `${count} fiscal documents in failed/error state`,
          details: { count },
        });
      }
    } catch {
      // Table might not exist
    }

    return {
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString(),
    };
  }

  private async requirePlatformAccess(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
  }
}
