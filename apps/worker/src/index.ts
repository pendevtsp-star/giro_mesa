import { loadEnv, queueNames } from "@giromesa/config";
import * as schema from "@giromesa/db";
import { Worker } from "bullmq";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { processPendingFiscalDocuments } from "./fiscal";
import { publishPendingClubWhiskyOutbox } from "./outbox";

const env = loadEnv();
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });
const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: redisUrl.username } : {}),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
  maxRetriesPerRequest: null,
};

type QueueHandler = (job: { id: string | undefined; name: string; data: unknown }) => Promise<void>;

const handlers: Record<string, QueueHandler> = {
  [queueNames.audit]: async (job) => {
    console.log("audit event accepted", { jobId: job.id, name: job.name });
  },
  [queueNames.asaasWebhook]: async (job) => {
    console.log("asaas webhook accepted", {
      jobId: job.id,
      idempotency: "provider_external_event_id",
    });
  },
  [queueNames.fiscal]: async (job) => {
    const result = await processPendingFiscalDocuments(db);
    console.log("fiscal documents processed", {
      jobId: job.id,
      provider: env.FISCAL_PROVIDER,
      scanned: result.scanned,
    });
  },
  [queueNames.inventory]: async (job) => {
    console.log("inventory movement queued", { jobId: job.id });
  },
  [queueNames.messaging]: async (job) => {
    console.log("message queued", { jobId: job.id, provider: "meta_or_email_mock" });
  },
  [queueNames.outbox]: async (job) => {
    const result = await publishPendingClubWhiskyOutbox(db);
    console.log("outbox processed", { jobId: job.id, scanned: result.scanned });
  },
};

const workers = Object.entries(handlers).map(([queueName, handler]) => {
  const worker = new Worker(
    queueName,
    async (job) => {
      await handler({ id: job.id, name: job.name, data: job.data });
    },
    { connection },
  );

  worker.on("failed", (job, error) => {
    console.error("queue job failed", {
      queueName,
      jobId: job?.id,
      error: error.message,
    });
  });

  return worker;
});

const outboxPoller = setInterval(() => {
  publishPendingClubWhiskyOutbox(db).catch((error) => {
    console.error("outbox polling failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  });
}, 10_000);

const fiscalPoller = setInterval(() => {
  processPendingFiscalDocuments(db).catch((error) => {
    console.error("fiscal polling failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  });
}, 10_000);

void publishPendingClubWhiskyOutbox(db);
void processPendingFiscalDocuments(db);

process.on("SIGTERM", async () => {
  clearInterval(outboxPoller);
  clearInterval(fiscalPoller);
  await Promise.all(workers.map((worker) => worker.close()));
  await pool.end();
  process.exit(0);
});

console.log("GiroMesa worker running", { queues: Object.keys(handlers) });
