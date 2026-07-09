import { createServer, type Server } from "node:http";
import * as schema from "@giromesa/db";
import { integrationAccounts, outboxEvents, tenants } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishPendingClubWhiskyOutbox } from "./outbox";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

function listen(server: Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        resolve(address.port);
      }
    });
  });
}

runIntegration("club whisky outbox publisher", () => {
  let pool: Pool;
  let db: Db;
  let server: Server;
  let receivedPayload: Record<string, unknown> | undefined;
  let tenantId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });

    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        receivedPayload = JSON.parse(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    const port = await listen(server);
    process.env.CLUB_WHISKY_API_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.CLUB_WHISKY_API_KEY = "worker-test-api-key";
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
      await db.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  it("publishes pending club events and marks them as processed", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Worker Outbox Tenant",
        slug: `worker-outbox-${Date.now()}`,
        status: "active",
      })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create worker test tenant");
    }

    tenantId = tenant.id;

    await db.insert(integrationAccounts).values({
      tenantId,
      provider: "club_whisky",
      status: "active",
      config: { scopes: ["events:read"] },
      secretRef: "CLUB_WHISKY_API_KEY",
    });

    const [event] = await db
      .insert(outboxEvents)
      .values({
        tenantId,
        topic: "club.stock_movement.created",
        payload: { movementType: "club_bottle_sale" },
        availableAt: new Date(Date.now() - 1_000),
      })
      .returning();

    if (!event) {
      throw new Error("Failed to create worker test outbox event");
    }

    const result = await publishPendingClubWhiskyOutbox(db);
    const [storedEvent] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id))
      .limit(1);

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(receivedPayload?.id).toBe(event.id);
    expect(storedEvent?.status).toBe("processed");
    expect(storedEvent?.processedAt).toBeInstanceOf(Date);
  });
});
