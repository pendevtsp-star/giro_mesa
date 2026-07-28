import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

const tenantOverrideKeys = new Set(["tenantId", "tenant_id"]);

export function requirePermission(context: TenantContext, permission: string) {
  if (!context.permissions.includes(permission)) {
    throw new ForbiddenException({
      error: "forbidden",
      requiredPermission: permission,
    });
  }
}

export function rejectTenantOverride(body: unknown) {
  if (!body || typeof body !== "object") {
    return;
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      rejectTenantOverride(item);
    }
    return;
  }

  for (const [key, value] of Object.entries(body)) {
    if (tenantOverrideKeys.has(key)) {
      throw new BadRequestException("Tenant is resolved by the backend session");
    }
    rejectTenantOverride(value);
  }
}
