import { createHash } from "node:crypto";
import { auditLogs, fiscalCertificates } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../common/secret-vault";
import { DatabaseService } from "../database/database.service";

export type CertificateUploadInput = {
  branchId: string;
  name: string;
  type?: string | undefined;
  password?: string | undefined;
  data: Buffer;
  filename?: string | undefined;
};

@Injectable()
export class CertificateService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async upload(context: TenantContext, input: CertificateUploadInput) {
    if (input.data.length === 0) {
      throw new BadRequestException("Certificate data cannot be empty");
    }

    if (input.data.length > 10 * 1024 * 1024) {
      throw new BadRequestException("Certificate file too large (max 10MB)");
    }

    const dataEncrypted = encryptSecret(input.data.toString("base64"));

    const metadata: Record<string, unknown> = {};
    if (input.password) {
      metadata.passwordHash = createHash("sha256").update(input.password).digest("hex");
    }

    const [certificate] = await this.database.db
      .insert(fiscalCertificates)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        name: input.name,
        type: input.type ?? "a1",
        dataEncrypted,
        filename: input.filename,
        isActive: true,
        metadata,
      })
      .returning();

    if (!certificate) {
      throw new Error("Failed to create certificate");
    }

    await this.audit(context, {
      branchId: input.branchId,
      action: "fiscal.certificate_uploaded",
      entityType: "fiscal_certificate",
      entityId: certificate.id,
      metadata: { name: input.name, type: input.type ?? "a1", filename: input.filename },
    });

    return {
      id: certificate.id,
      name: certificate.name,
      type: certificate.type,
      branchId: certificate.branchId,
      filename: certificate.filename,
      isActive: certificate.isActive,
      createdAt: certificate.createdAt,
    };
  }

  async list(context: TenantContext, branchId?: string) {
    const conditions = [eq(fiscalCertificates.tenantId, context.tenantId)];
    if (branchId) {
      conditions.push(eq(fiscalCertificates.branchId, branchId));
    }

    return this.database.db
      .select({
        id: fiscalCertificates.id,
        name: fiscalCertificates.name,
        type: fiscalCertificates.type,
        branchId: fiscalCertificates.branchId,
        filename: fiscalCertificates.filename,
        expiresAt: fiscalCertificates.expiresAt,
        isActive: fiscalCertificates.isActive,
        createdAt: fiscalCertificates.createdAt,
      })
      .from(fiscalCertificates)
      .where(and(...conditions))
      .orderBy(sql`${fiscalCertificates.createdAt} DESC`);
  }

  async get(context: TenantContext, certificateId: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.id, certificateId),
        ),
      )
      .limit(1);

    if (!certificate) {
      throw new NotFoundException("Certificate not found");
    }

    return {
      id: certificate.id,
      name: certificate.name,
      type: certificate.type,
      branchId: certificate.branchId,
      filename: certificate.filename,
      expiresAt: certificate.expiresAt,
      lastValidatedAt: certificate.lastValidatedAt,
      validationError: certificate.validationError,
      isActive: certificate.isActive,
      createdAt: certificate.createdAt,
    };
  }

  async delete(context: TenantContext, certificateId: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.id, certificateId),
        ),
      )
      .limit(1);

    if (!certificate) {
      throw new NotFoundException("Certificate not found");
    }

    await this.database.db
      .delete(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.id, certificateId),
        ),
      );

    await this.audit(context, {
      branchId: certificate.branchId,
      action: "fiscal.certificate_deleted",
      entityType: "fiscal_certificate",
      entityId: certificate.id,
      metadata: { name: certificate.name },
    });
  }

  async validate(context: TenantContext, certificateId: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.id, certificateId),
        ),
      )
      .limit(1);

    if (!certificate) {
      throw new NotFoundException("Certificate not found");
    }

    const warnings: string[] = [];

    if (certificate.expiresAt && certificate.expiresAt < new Date()) {
      warnings.push("Certificate has expired");
    }

    const hasValidEncryption = certificate.dataEncrypted.startsWith("v1:");
    if (!hasValidEncryption) {
      warnings.push("Certificate encryption format is invalid");
    }

    const canDecrypt = this.testDecryption(certificate.dataEncrypted);
    if (!canDecrypt) {
      warnings.push("Certificate data is corrupted or cannot be decrypted");
    }

    const validationError = warnings.length > 0 ? warnings.join("; ") : null;

    await this.database.db
      .update(fiscalCertificates)
      .set({
        lastValidatedAt: new Date(),
        validationError,
        updatedAt: new Date(),
      })
      .where(eq(fiscalCertificates.id, certificateId));

    return {
      id: certificate.id,
      name: certificate.name,
      type: certificate.type,
      expiresAt: certificate.expiresAt,
      isActive: certificate.isActive,
      isValid: warnings.length === 0,
      warnings,
      lastValidated: new Date(),
    };
  }

  async getActiveCertificate(context: TenantContext, branchId: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.branchId, branchId),
          eq(fiscalCertificates.isActive, true),
        ),
      )
      .limit(1);

    return certificate;
  }

  async getCertificateData(context: TenantContext, certificateId: string, password?: string) {
    const [certificate] = await this.database.db
      .select()
      .from(fiscalCertificates)
      .where(
        and(
          eq(fiscalCertificates.tenantId, context.tenantId),
          eq(fiscalCertificates.id, certificateId),
        ),
      )
      .limit(1);

    if (!certificate) {
      throw new NotFoundException("Certificate not found");
    }

    if (!certificate.isActive) {
      throw new BadRequestException("Certificate is not active");
    }

    if (certificate.expiresAt && certificate.expiresAt < new Date()) {
      throw new BadRequestException("Certificate has expired");
    }

    const metadata = (certificate.metadata ?? {}) as Record<string, unknown>;
    const passwordHash = metadata.passwordHash as string | undefined;

    if (passwordHash && password) {
      const computedHash = createHash("sha256").update(password).digest("hex");
      if (computedHash !== passwordHash) {
        throw new BadRequestException("Invalid certificate password");
      }
    } else if (passwordHash && !password) {
      throw new BadRequestException("Certificate requires a password");
    }

    const decryptedBase64 = decryptSecret(certificate.dataEncrypted);
    return Buffer.from(decryptedBase64, "base64");
  }

  private testDecryption(dataEncrypted: string): boolean {
    try {
      decryptSecret(dataEncrypted);
      return true;
    } catch {
      return false;
    }
  }

  private async audit(
    context: TenantContext,
    input: {
      branchId?: string | undefined;
      action: string;
      entityType: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }
}
