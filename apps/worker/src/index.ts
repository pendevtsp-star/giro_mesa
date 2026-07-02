import { loadEnv, queueNames } from "@giromesa/config";
import { Worker } from "bullmq";

const env = loadEnv();
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
    console.log("fiscal document queued", { jobId: job.id, provider: env.FISCAL_PROVIDER });
  },
  [queueNames.inventory]: async (job) => {
    console.log("inventory movement queued", { jobId: job.id });
  },
  [queueNames.messaging]: async (job) => {
    console.log("message queued", { jobId: job.id, provider: "meta_or_email_mock" });
  },
  [queueNames.outbox]: async (job) => {
    console.log("outbox event queued", { jobId: job.id });
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

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
});

console.log("GiroMesa worker running", { queues: Object.keys(handlers) });
