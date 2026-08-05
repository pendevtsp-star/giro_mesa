import { loadEnv } from "@giromesa/config";
import * as schema from "@giromesa/db";
import { withAuditSanitization } from "@giromesa/db";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createCounter, createGauge } from "../../common/metrics";

const poolTotal = createGauge("giromesa_db_pool_total", "Database pool connections");
const poolIdle = createGauge("giromesa_db_pool_idle", "Idle database pool connections");
const poolWaiting = createGauge(
  "giromesa_db_pool_waiting",
  "Requests waiting for a database connection",
);
const poolErrors = createCounter(
  "giromesa_db_pool_errors_total",
  "Unexpected database pool errors",
);

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor() {
    const env = loadEnv();
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    });
    const updateMetrics = () => this.updatePoolMetrics(env.API_INSTANCE_ID);
    this.pool.on("connect", updateMetrics);
    this.pool.on("acquire", updateMetrics);
    this.pool.on("remove", updateMetrics);
    this.pool.on("error", () => {
      poolErrors.inc({ instance: env.API_INSTANCE_ID });
      updateMetrics();
    });
    updateMetrics();
    this.db = withAuditSanitization(drizzle(this.pool, { schema }));
  }

  getPoolStats() {
    return {
      max: this.pool.options.max ?? 10,
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private updatePoolMetrics(instance: string) {
    const labels = { instance };
    poolTotal.set(labels, this.pool.totalCount);
    poolIdle.set(labels, this.pool.idleCount);
    poolWaiting.set(labels, this.pool.waitingCount);
  }
}
