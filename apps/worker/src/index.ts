import { exec } from "node:child_process";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadEnv, queueNames } from "@giromesa/config";
import * as schema from "@giromesa/db";
import { inventoryItems } from "@giromesa/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { processPendingFiscalDocuments } from "./fiscal";
import { publishPendingClubWhiskyOutbox } from "./outbox";
import { createWhatsAppProvider, type WhatsAppMessage } from "./whatsapp-provider";

const execAsync = promisify(exec);

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

type BackupMetadata = {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  checksum: string;
  status: "completed" | "failed" | "validating";
  validatedAt?: string;
  validationChecksum?: string;
};

const handlers: Record<string, QueueHandler> = {
  [queueNames.audit]: async (job) => {
    const data = job.data as Record<string, unknown>;
    const action = String(data.action ?? "unknown");
    const tenantId = String(data.tenantId ?? "unknown");
    const entityType = String(data.entityType ?? "unknown");
    const entityId = String(data.entityId ?? "unknown");

    console.log("audit event processed", {
      jobId: job.id,
      action,
      tenantId,
      entityType,
      entityId,
    });

    const criticalActions = [
      "payment.refunded",
      "fiscal.document_canceled",
      "auth.login_failed",
      "tenant.access_blocked",
      "user.permissions_changed",
    ];

    if (criticalActions.includes(action)) {
      console.warn("CRITICAL AUDIT ALERT", {
        jobId: job.id,
        action,
        tenantId,
        entityType,
        entityId,
        metadata: data.metadata,
      });
    }
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
    const data = job.data as Record<string, unknown>;
    const tenantId = String(data.tenantId ?? "unknown");
    const inventoryItemId = String(data.inventoryItemId ?? "unknown");
    const movementType = String(data.type ?? "unknown");
    const quantity = String(data.quantity ?? "0");

    console.log("inventory movement processed", {
      jobId: job.id,
      tenantId,
      inventoryItemId,
      movementType,
      quantity,
    });

    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, inventoryItemId))
      .limit(1);

    if (item && Number(quantity) < 0) {
      const currentStock = Number(item.minQuantity);
      if (currentStock <= 0) {
        console.warn("LOW STOCK ALERT", {
          jobId: job.id,
          tenantId,
          inventoryItemId,
          itemName: item.name,
          minQuantity: item.minQuantity,
          movementType,
          quantity,
        });
      }
    }
  },
  [queueNames.messaging]: async (job) => {
    const data = job.data as Record<string, unknown>;
    const channel = String(data.channel ?? "unknown");
    const to = String(data.to ?? "unknown");
    const tenantId = data.tenantId;

    if (channel !== "whatsapp") {
      console.log("message dispatched (non-whatsapp channel)", {
        jobId: job.id,
        channel,
        to,
        tenantId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const provider = createWhatsAppProvider();
    const message = buildWhatsAppMessage(data, to);

    try {
      const result = await provider.send(message);
      if (result.status === "disabled") {
        console.warn("whatsapp delivery disabled", {
          jobId: job.id,
          to,
          tenantId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      console.log("whatsapp message sent", {
        jobId: job.id,
        messageId: result.messageId,
        status: result.status,
        to,
        tenantId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("whatsapp message failed", {
        jobId: job.id,
        to,
        tenantId,
        channel,
        error: error instanceof Error ? error.message : "unknown_error",
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  },
  [queueNames.outbox]: async (job) => {
    const result = await publishPendingClubWhiskyOutbox(db);
    console.log("outbox processed", { jobId: job.id, scanned: result.scanned });
  },
  [queueNames.backup]: async (job) => {
    const data = job.data as Record<string, unknown>;
    const action = String(data.action ?? "create");
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";

    console.log("backup job started", { jobId: job.id, action, backupDir });

    try {
      if (action === "create") {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `giromesa-backup-${timestamp}.sql.gz`;
        const filepath = join(backupDir, filename);

        const dbUrl = new URL(env.DATABASE_URL);
        const dbHost = dbUrl.hostname;
        const dbPort = dbUrl.port || "5432";
        const dbName = dbUrl.pathname.slice(1);
        const dbUser = decodeURIComponent(dbUrl.username);
        const dbPassword = decodeURIComponent(dbUrl.password);

        const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --format=custom --compress=9 --file="${filepath}"`;

        const { stderr } = await execAsync(command);

        if (stderr && !stderr.includes("NOTICE")) {
          throw new Error(`pg_dump error: ${stderr}`);
        }

        const fileStat = await stat(filepath);
        const checksum = await calculateChecksum(filepath);

        const metadata: BackupMetadata = {
          id: filename.replace(".sql.gz", ""),
          filename,
          createdAt: new Date().toISOString(),
          sizeBytes: fileStat.size,
          checksum,
          status: "completed",
        };

        await writeFile(`${filepath}.meta.json`, JSON.stringify(metadata, null, 2));

        console.log("backup completed", {
          jobId: job.id,
          filename,
          sizeBytes: fileStat.size,
          checksum,
        });

        if (env.BACKUP_VALIDATE_AFTER_CREATE === "true") {
          try {
            const validateCommand = `PGPASSWORD="${dbPassword}" pg_restore -l "${filepath}" > /dev/null 2>&1`;
            await execAsync(validateCommand);

            metadata.status = "validating";
            metadata.validatedAt = new Date().toISOString();
            metadata.validationChecksum = checksum;
            await writeFile(`${filepath}.meta.json`, JSON.stringify(metadata, null, 2));

            console.log("backup validation passed", { jobId: job.id, filename });
          } catch (validationError) {
            console.error("backup validation failed", {
              jobId: job.id,
              filename,
              error: validationError instanceof Error ? validationError.message : "unknown_error",
            });
          }
        }
      } else if (action === "cleanup") {
        const retentionDays = env.BACKUP_RETENTION_DAYS ?? 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const files = await readdir(backupDir);
        let deleted = 0;

        for (const file of files) {
          if (!file.endsWith(".sql.gz")) continue;

          const filepath = join(backupDir, file);
          const fileStat = await stat(filepath);

          if (fileStat.mtime < cutoffDate) {
            await unlink(filepath);
            try {
              await unlink(`${filepath}.meta.json`);
            } catch {
              // Metadata file may not exist
            }
            deleted++;
          }
        }

        console.log("backup cleanup completed", { jobId: job.id, deleted, retentionDays });
      }

      if (env.NOTIFY_BACKUP_WEBHOOK) {
        try {
          await fetch(env.NOTIFY_BACKUP_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "backup_completed",
              action,
              timestamp: new Date().toISOString(),
              jobId: job.id,
            }),
          });
        } catch (webhookError) {
          console.warn("backup notification webhook failed", {
            jobId: job.id,
            error: webhookError instanceof Error ? webhookError.message : "unknown_error",
          });
        }
      }
    } catch (error) {
      console.error("backup job failed", {
        jobId: job.id,
        action,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      throw error;
    }
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

async function calculateChecksum(filepath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`sha256sum "${filepath}" | cut -d' ' -f1`);
    return stdout.trim();
  } catch {
    return "";
  }
}

function buildWhatsAppMessage(data: Record<string, unknown>, to: string): WhatsAppMessage {
  const messageType = String(data.messageType ?? "template");

  if (messageType === "text") {
    return {
      type: "text",
      to,
      text: String(data.text ?? ""),
    };
  }

  if (messageType === "media") {
    const caption = typeof data.caption === "string" ? data.caption : undefined;
    const filename = typeof data.filename === "string" ? data.filename : undefined;
    return {
      type: "media",
      to,
      mediaType: String(data.mediaType ?? "image") as "image" | "video" | "document" | "audio",
      mediaUrl: String(data.mediaUrl ?? ""),
      ...(caption ? { caption } : {}),
      ...(filename ? { filename } : {}),
    };
  }

  const params = Array.isArray(data.params) ? data.params : undefined;
  return {
    type: "template",
    to,
    templateName: String(data.templateName ?? ""),
    languageCode: String(data.languageCode ?? "pt_BR"),
    ...(params ? { params } : {}),
  };
}
