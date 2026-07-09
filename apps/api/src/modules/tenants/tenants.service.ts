import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditLogs, branches, plans, roles, tenants, userRoles, users } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { hashPassword } from "../../common/password";
import { DatabaseService } from "../database/database.service";

type CreateTenantInput = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  document?: string | undefined;
  planCode?: string | undefined;
};

export type TenantBranding = {
  displayName: string;
  logoUrl: string | null;
  themeMode: "light" | "dark" | "system";
  accentPreset: "emerald" | "blue" | "amber" | "rose" | "violet";
};

type UpdateTenantBrandingInput = {
  displayName?: string | undefined;
  logoUrl?: string | null | undefined;
  themeMode?: TenantBranding["themeMode"] | undefined;
  accentPreset?: TenantBranding["accentPreset"] | undefined;
};

type UploadTenantLogoInput = {
  fileName: string;
  dataUrl: string;
};

const defaultBranding: TenantBranding = {
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};
const maxLogoBytes = 512 * 1024;

@Injectable()
export class TenantsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getBranding(context: TenantContext) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);

    return this.readBranding(tenant?.settings, tenant?.name);
  }

  async updateBranding(context: TenantContext, input: UpdateTenantBrandingInput) {
    const [tenant] = await this.database.db
      .select({
        id: tenants.id,
        name: tenants.name,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const previousBranding = this.readBranding(tenant.settings, tenant.name);
    const nextBranding = {
      displayName: input.displayName?.trim() || previousBranding.displayName,
      logoUrl: input.logoUrl === undefined ? previousBranding.logoUrl : input.logoUrl || null,
      themeMode: input.themeMode ?? previousBranding.themeMode,
      accentPreset: input.accentPreset ?? previousBranding.accentPreset,
    } satisfies TenantBranding;

    const nextSettings = {
      ...(tenant.settings ?? {}),
      branding: nextBranding,
    };

    const [updatedTenant] = await this.database.db
      .update(tenants)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, context.tenantId))
      .returning({
        name: tenants.name,
        settings: tenants.settings,
      });

    await this.auditBranding(context, "tenant.branding_updated", {
      changedFields: Object.keys(input),
      previous: previousBranding,
      next: nextBranding,
    });

    return this.readBranding(updatedTenant?.settings, updatedTenant?.name);
  }

  async uploadLogo(context: TenantContext, input: UploadTenantLogoInput) {
    const previousBranding = await this.getBranding(context);
    const logo = this.decodeLogo(input.dataUrl);
    const root = this.workspaceRoot();
    const uploadDir = path.join(root, "apps", "web", "public", "uploads", "tenant-logos");
    const safeName = input.fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 42);
    const fileName = `${context.tenantId}-${Date.now()}-${safeName || randomUUID()}.${logo.ext}`;
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), logo.buffer, { flag: "wx" });

    const logoUrl = new URL(
      `/uploads/tenant-logos/${fileName}`,
      process.env.APP_URL ?? "http://localhost:3002",
    ).toString();
    const branding = await this.updateBranding(context, { logoUrl });
    await this.deleteLocalLogoIfManaged(previousBranding.logoUrl);
    await this.auditBranding(context, "tenant.branding_logo_uploaded", {
      previousLogoUrl: previousBranding.logoUrl,
      nextLogoUrl: logoUrl,
      mimeType: logo.mime,
      bytes: logo.buffer.byteLength,
    });

    return {
      logoUrl,
      branding,
    };
  }

  async removeLogo(context: TenantContext) {
    const previousBranding = await this.getBranding(context);
    const branding = await this.updateBranding(context, { logoUrl: null });
    await this.deleteLocalLogoIfManaged(previousBranding.logoUrl);
    await this.auditBranding(context, "tenant.branding_logo_removed", {
      previousLogoUrl: previousBranding.logoUrl,
    });

    return {
      removed: true,
      branding,
    };
  }

  async createTenant(input: CreateTenantInput) {
    const slug = input.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const planCode = input.planCode ?? "starter";
    const passwordHash = await hashPassword(input.ownerPassword);

    return this.database.db.transaction(async (tx) => {
      const [existingPlan] = await tx.select().from(plans).where(eq(plans.code, planCode)).limit(1);
      const [plan] = existingPlan
        ? [existingPlan]
        : await tx
            .insert(plans)
            .values({
              code: planCode,
              name: planCode === "starter" ? "Starter" : planCode,
              priceCents: planCode === "starter" ? 14900 : 0,
              limits: {
                branches: 1,
                users: 5,
                products: 150,
              },
            })
            .returning();

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug,
          document: input.document,
          status: "trial",
        })
        .returning();

      if (!tenant || !plan) {
        throw new Error("Failed to create tenant");
      }

      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: "Matriz",
          document: input.document,
        })
        .returning();

      const [ownerRole] = await tx
        .insert(roles)
        .values({
          tenantId: tenant.id,
          code: "owner",
          name: "Proprietario",
          permissions: [
            "tenant:manage",
            "catalog:manage",
            "pos:operate",
            "kds:operate",
            "cash:manage",
            "inventory:manage",
            "reports:read",
          ],
        })
        .returning();

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.ownerEmail.toLowerCase(),
          name: input.ownerName,
          passwordHash,
        })
        .returning();

      if (!branch || !ownerRole || !owner) {
        throw new Error("Failed to create owner account");
      }

      await tx.insert(userRoles).values({
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        branchId: branch.id,
      });

      return {
        tenant,
        branch,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        },
        subscription: {
          planCode: plan.code,
          status: "trial",
          nextStep: "create_asaas_checkout_when_enabled",
        },
      };
    });
  }

  private readBranding(settings: Record<string, unknown> | undefined, tenantName?: string) {
    const rawBranding =
      settings && typeof settings.branding === "object" && settings.branding !== null
        ? (settings.branding as Partial<TenantBranding>)
        : {};

    return {
      displayName:
        typeof rawBranding.displayName === "string" && rawBranding.displayName.trim().length > 0
          ? rawBranding.displayName.trim()
          : tenantName || defaultBranding.displayName,
      logoUrl:
        typeof rawBranding.logoUrl === "string" && rawBranding.logoUrl ? rawBranding.logoUrl : null,
      themeMode:
        rawBranding.themeMode === "dark" || rawBranding.themeMode === "system"
          ? rawBranding.themeMode
          : defaultBranding.themeMode,
      accentPreset:
        rawBranding.accentPreset === "blue" ||
        rawBranding.accentPreset === "amber" ||
        rawBranding.accentPreset === "rose" ||
        rawBranding.accentPreset === "violet"
          ? rawBranding.accentPreset
          : defaultBranding.accentPreset,
    } satisfies TenantBranding;
  }

  private decodeLogo(dataUrl: string) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw new BadRequestException("Logo must be a PNG, JPEG or WebP data URL");
    }

    const mime = match[1];
    const buffer = Buffer.from(match[2] ?? "", "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > maxLogoBytes) {
      throw new BadRequestException("Logo must be smaller than 512 KB");
    }

    if (mime === "image/png" && buffer.subarray(0, 4).toString("hex") === "89504e47") {
      return { buffer, ext: "png", mime };
    }

    if (mime === "image/jpeg" && buffer.subarray(0, 3).toString("hex") === "ffd8ff") {
      return { buffer, ext: "jpg", mime };
    }

    if (
      mime === "image/webp" &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return { buffer, ext: "webp", mime };
    }

    throw new BadRequestException("Logo file signature does not match the declared type");
  }

  private workspaceRoot() {
    const cwd = process.cwd();
    if (path.basename(cwd) === "api" && path.basename(path.dirname(cwd)) === "apps") {
      return path.resolve(cwd, "..", "..");
    }
    return cwd;
  }

  private async auditBranding(
    context: TenantContext,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType: "tenant",
      entityId: context.tenantId,
      metadata,
    });
  }

  private async deleteLocalLogoIfManaged(logoUrl: string | null) {
    if (!logoUrl) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(logoUrl);
    } catch {
      return;
    }

    if (!parsed.pathname.startsWith("/uploads/tenant-logos/")) {
      return;
    }

    const fileName = path.basename(parsed.pathname);
    const target = path.join(
      this.workspaceRoot(),
      "apps",
      "web",
      "public",
      "uploads",
      "tenant-logos",
      fileName,
    );
    const uploadDir = path.join(
      this.workspaceRoot(),
      "apps",
      "web",
      "public",
      "uploads",
      "tenant-logos",
    );
    const resolvedTarget = path.resolve(target);
    const resolvedDir = path.resolve(uploadDir);
    if (!resolvedTarget.startsWith(resolvedDir)) {
      return;
    }

    await unlink(resolvedTarget).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    });
  }
}
