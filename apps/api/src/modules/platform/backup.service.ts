import { exec } from "node:child_process";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadEnv } from "@giromesa/config";
import { auditLogs } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

const execAsync = promisify(exec);

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

type BackupValidationResult = {
  valid: boolean;
  backupId: string;
  checksumMatch: boolean;
  fileExists: boolean;
  errors: string[];
};

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createBackup(context: TenantContext): Promise<BackupMetadata> {
    const env = loadEnv();
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `giromesa-backup-${timestamp}.sql.gz`;
    const filepath = join(backupDir, filename);

    try {
      const dbUrl = new URL(env.DATABASE_URL);
      const dbHost = dbUrl.hostname;
      const dbPort = dbUrl.port || "5432";
      const dbName = dbUrl.pathname.slice(1);
      const dbUser = decodeURIComponent(dbUrl.username);
      const dbPassword = decodeURIComponent(dbUrl.password);

      const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --format=custom --compress=9 --file="${filepath}"`;

      this.logger.log(`Creating backup: ${filename}`);
      const { stderr } = await execAsync(command);

      if (stderr && !stderr.includes("NOTICE")) {
        throw new Error(`pg_dump error: ${stderr}`);
      }

      const fileStat = await stat(filepath);
      const checksum = await this.calculateChecksum(filepath);

      const metadata: BackupMetadata = {
        id: filename.replace(".sql.gz", ""),
        filename,
        createdAt: new Date().toISOString(),
        sizeBytes: fileStat.size,
        checksum,
        status: "completed",
      };

      await this.writeMetadata(filepath, metadata);

      await this.database.db.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "platform.backup.created",
        entityType: "backup",
        entityId: metadata.id,
        metadata: {
          filename,
          sizeBytes: fileStat.size,
          checksum,
          platformUserId: context.userId,
        },
      });

      this.logger.log(`Backup created successfully: ${filename} (${fileStat.size} bytes)`);

      return metadata;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Backup failed: ${errorMessage}`);

      await this.database.db.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "platform.backup.failed",
        entityType: "backup",
        entityId: filename,
        metadata: {
          error: errorMessage,
          platformUserId: context.userId,
        },
      });

      throw new InternalServerErrorException(`Backup failed: ${errorMessage}`);
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    const env = loadEnv();
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";

    try {
      const files = await readdir(backupDir);
      const backups: BackupMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith(".sql.gz")) continue;

        const filepath = join(backupDir, file);
        const fileStat = await stat(filepath);
        const metadata = await this.readMetadata(filepath);

        if (metadata) {
          backups.push(metadata);
        } else {
          backups.push({
            id: file.replace(".sql.gz", ""),
            filename: file,
            createdAt: fileStat.mtime.toISOString(),
            sizeBytes: fileStat.size,
            checksum: "",
            status: "completed",
          });
        }
      }

      return backups.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async restoreBackup(
    context: TenantContext,
    backupId: string,
  ): Promise<{ success: boolean; message: string }> {
    const env = loadEnv();
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";

    const validation = await this.validateBackup(context, backupId);
    if (!validation.valid) {
      throw new BadRequestException(`Backup validation failed: ${validation.errors.join(", ")}`);
    }

    const filename = `${backupId}.sql.gz`;
    const filepath = join(backupDir, filename);

    try {
      const dbUrl = new URL(env.DATABASE_URL);
      const dbHost = dbUrl.hostname;
      const dbPort = dbUrl.port || "5432";
      const dbName = dbUrl.pathname.slice(1);
      const dbUser = decodeURIComponent(dbUrl.username);
      const dbPassword = decodeURIComponent(dbUrl.password);

      const command = `PGPASSWORD="${dbPassword}" pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --clean --if-exists "${filepath}"`;

      this.logger.log(`Restoring backup: ${filename}`);
      const { stderr } = await execAsync(command);

      if (stderr && !stderr.includes("NOTICE")) {
        this.logger.warn(`Restore warnings: ${stderr}`);
      }

      await this.database.db.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "platform.backup.restored",
        entityType: "backup",
        entityId: backupId,
        metadata: {
          filename,
          platformUserId: context.userId,
        },
      });

      this.logger.log(`Backup restored successfully: ${filename}`);

      return { success: true, message: `Backup ${backupId} restored successfully` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Restore failed: ${errorMessage}`);

      await this.database.db.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "platform.backup.restore_failed",
        entityType: "backup",
        entityId: backupId,
        metadata: {
          error: errorMessage,
          platformUserId: context.userId,
        },
      });

      throw new InternalServerErrorException(`Restore failed: ${errorMessage}`);
    }
  }

  async validateBackup(context: TenantContext, backupId: string): Promise<BackupValidationResult> {
    const env = loadEnv();
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";
    const filename = `${backupId}.sql.gz`;
    const filepath = join(backupDir, filename);

    const result: BackupValidationResult = {
      valid: false,
      backupId,
      checksumMatch: false,
      fileExists: false,
      errors: [],
    };

    try {
      await stat(filepath);
      result.fileExists = true;
    } catch {
      result.errors.push("Backup file not found");
      return result;
    }

    const metadata = await this.readMetadata(filepath);
    if (!metadata) {
      result.errors.push("Metadata file not found or corrupted");
      return result;
    }

    const currentChecksum = await this.calculateChecksum(filepath);
    result.checksumMatch = currentChecksum === metadata.checksum;

    if (!result.checksumMatch) {
      result.errors.push("Checksum mismatch - backup may be corrupted");
      return result;
    }

    try {
      const env = loadEnv();
      const dbUrl = new URL(env.DATABASE_URL);
      const _dbHost = dbUrl.hostname;
      const _dbPort = dbUrl.port || "5432";
      const _dbUser = decodeURIComponent(dbUrl.username);
      const dbPassword = decodeURIComponent(dbUrl.password);
      const _dbName = dbUrl.pathname.slice(1);

      const command = `PGPASSWORD="${dbPassword}" pg_restore -l "${filepath}" > /dev/null 2>&1`;
      await execAsync(command);

      await this.database.db.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        action: "platform.backup.validated",
        entityType: "backup",
        entityId: backupId,
        metadata: {
          checksumMatch: true,
          platformUserId: context.userId,
        },
      });

      result.valid = true;

      const updatedMetadata: BackupMetadata = {
        ...metadata,
        validatedAt: new Date().toISOString(),
        validationChecksum: currentChecksum,
      };
      await this.writeMetadata(filepath, updatedMetadata);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`pg_restore validation failed: ${errorMessage}`);
    }

    return result;
  }

  async scheduleBackup(
    context: TenantContext,
    cron: string,
  ): Promise<{ scheduleId: string; cron: string }> {
    const _env = loadEnv();

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      userId: context.userId,
      requestId: context.requestId,
      action: "platform.backup.schedule_created",
      entityType: "backup",
      entityId: "schedule",
      metadata: {
        cron,
        platformUserId: context.userId,
      },
    });

    return {
      scheduleId: `backup-schedule-${Date.now()}`,
      cron,
    };
  }

  async cleanupOldBackups(context: TenantContext): Promise<{ deleted: number }> {
    const env = loadEnv();
    const backupDir = env.BACKUP_STORAGE_PATH ?? "./backups";
    const retentionDays = env.BACKUP_RETENTION_DAYS ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const files = await readdir(backupDir);
      let deleted = 0;

      for (const file of files) {
        if (!file.endsWith(".sql.gz")) continue;

        const filepath = join(backupDir, file);
        const fileStat = await stat(filepath);

        if (fileStat.mtime < cutoffDate) {
          await unlink(filepath);

          const metadataPath = `${filepath}.meta.json`;
          try {
            await unlink(metadataPath);
          } catch {
            // Metadata file may not exist
          }

          deleted++;
        }
      }

      if (deleted > 0) {
        await this.database.db.insert(auditLogs).values({
          tenantId: context.tenantId,
          userId: context.userId,
          requestId: context.requestId,
          action: "platform.backup.cleanup_completed",
          entityType: "backup",
          entityId: "cleanup",
          metadata: {
            deletedCount: deleted,
            retentionDays,
            platformUserId: context.userId,
          },
        });
      }

      return { deleted };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Backup cleanup failed: ${errorMessage}`);
      throw error;
    }
  }

  private async calculateChecksum(filepath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`sha256sum "${filepath}" | cut -d' ' -f1`);
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private async writeMetadata(filepath: string, metadata: BackupMetadata): Promise<void> {
    const metaPath = `${filepath}.meta.json`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  private async readMetadata(filepath: string): Promise<BackupMetadata | null> {
    const metaPath = `${filepath}.meta.json`;
    try {
      const content = await readFile(metaPath, "utf-8");
      return JSON.parse(content) as BackupMetadata;
    } catch {
      return null;
    }
  }
}
