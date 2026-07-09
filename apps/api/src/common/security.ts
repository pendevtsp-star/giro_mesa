import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

const tenantOverrideKeys = new Set(["tenantId", "tenant_id"]);

export function requirePermission(context: TenantContext, permission: string) {
  const compatiblePermission = resolveCompatiblePermission(permission);
  if (
    !context.permissions.includes(permission) &&
    !context.permissions.includes(compatiblePermission)
  ) {
    throw new ForbiddenException({
      error: "forbidden",
      requiredPermission: permission,
    });
  }
}

function resolveCompatiblePermission(permission: string) {
  if (permission.startsWith("pos:")) {
    return "pos:operate";
  }
  return permission;
}

export function rejectTenantOverride(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return;
  }

  for (const key of Object.keys(body)) {
    if (tenantOverrideKeys.has(key)) {
      throw new BadRequestException("Tenant is resolved by the backend session");
    }
  }
}
