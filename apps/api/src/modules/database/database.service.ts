import { loadEnv } from "@giromesa/config";
import * as schema from "@giromesa/db";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor() {
    const env = loadEnv();
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
