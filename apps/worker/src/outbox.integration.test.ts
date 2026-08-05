import { createHmac } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import { SafeHttpClient, type SafeHttpResolver, type SafeHttpTransport } from "@giromesa/config";
import * as schema from "@giromesa/db";
import { integrationAccounts, outboxEvents, tenants } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  let receivedHeaders: Record<string, string | string[] | undefined> | undefined;
  let receivedRawBody: string | undefined;
  let tenantId: string;
  let fixturePort: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });

    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        receivedHeaders = request.headers;
        receivedRawBody = body;
        receivedPayload = JSON.parse(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    fixturePort = await listen(server);
    process.env.CLUB_WHISKY_API_BASE_URL = "https://doseclub.test";
    process.env.CLUB_WHISKY_WEBHOOK_SECRET = "worker-test-webhook-secret";
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
      config: {
        scopes: ["events:read"],
        remoteClientId: "dose-club-tenant-a",
      },
      secretRef: "CLUB_WHISKY_WEBHOOK_SECRET",
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

    const resolver: SafeHttpResolver = async (hostname) => {
      expect(hostname).toBe("doseclub.test");
      return [{ address: "203.0.113.20", family: 4 }];
    };
    const transport = fixtureTransport(fixturePort);
    const safeClient = new SafeHttpClient(resolver, transport);
    const result = await publishPendingClubWhiskyOutbox(db, {
      request: safeClient.fetch.bind(safeClient),
    });
    const [storedEvent] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id))
      .limit(1);

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(receivedPayload?.id).toBe(event.id);
    expect(receivedPayload?.event).toBe("club.stock_movement.created");
    expect(receivedPayload?.contractVersion).toBe("2026-07-30");
    expect(receivedPayload?.correlationId).toBe(event.id);
    expect(receivedPayload?.data).toEqual({ movementType: "club_bottle_sale" });
    expect(receivedPayload).not.toHaveProperty("tenantId");
    expect(receivedHeaders?.["x-giromesa-client-id"]).toBe("dose-club-tenant-a");
    expect(receivedHeaders?.["x-giromesa-contract-version"]).toBe("2026-07-30");
    expect(receivedHeaders?.["x-giromesa-correlation-id"]).toBe(event.id);
    expect(receivedHeaders?.["x-giromesa-event-id"]).toBe(event.id);
    expect(receivedHeaders?.["x-giromesa-signature"]).toBe(
      `sha256=${createHmac("sha256", "worker-test-webhook-secret")
        .update(receivedRawBody ?? "")
        .digest("hex")}`,
    );
    expect(storedEvent?.status).toBe("processed");
    expect(storedEvent?.processedAt).toBeInstanceOf(Date);

    const [unsafeEvent] = await db
      .insert(outboxEvents)
      .values({
        tenantId,
        topic: "club.stock_movement.created",
        payload: { movementType: "unsafe-resolution-probe" },
        availableAt: new Date(Date.now() - 1_000),
      })
      .returning();
    if (!unsafeEvent) throw new Error("Failed to create unsafe resolver test event");
    const unusedTransport = vi.fn<SafeHttpTransport>();
    const unsafeClient = new SafeHttpClient(
      async () => [{ address: "127.0.0.1", family: 4 }],
      unusedTransport,
    );
    await publishPendingClubWhiskyOutbox(db, {
      request: unsafeClient.fetch.bind(unsafeClient),
    });
    const [storedUnsafeEvent] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, unsafeEvent.id))
      .limit(1);
    expect(unusedTransport).not.toHaveBeenCalled();
    expect(storedUnsafeEvent).toMatchObject({
      status: "pending",
      attempts: 1,
      errorMessage: "club_whisky_publish_unavailable",
    });
  });
});

function fixtureTransport(port: number): SafeHttpTransport {
  return async (outbound) => {
    expect(outbound.url.protocol).toBe("https:");
    expect(outbound.address).toEqual({ address: "203.0.113.20", family: 4 });

    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: `${outbound.url.pathname}${outbound.url.search}`,
          method: outbound.method,
          headers: outbound.headers,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              statusText: response.statusMessage ?? "",
              headers: {},
              body: Buffer.concat(chunks),
            });
          });
        },
      );
      request.on("error", reject);
      if (outbound.body !== undefined) request.write(outbound.body);
      request.end();
    });
  };
}
