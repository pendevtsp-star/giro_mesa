import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { withAuditSanitization } from "./audit-sanitization";
import * as schema from "./schema";

export * from "./audit-sanitization";
export * from "./schema";

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return withAuditSanitization(drizzle(pool, { schema }));
}
