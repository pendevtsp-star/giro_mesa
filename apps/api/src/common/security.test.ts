import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { rejectTenantOverride, requirePermission } from "./security";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  requestId: "request-a",
  permissions: ["catalog:manage"],
};

describe("security guardrails", () => {
  it("allows requests with the required backend permission", () => {
    expect(() => requirePermission(context, "catalog:manage")).not.toThrow();
  });

  it("throws 403 when a backend permission is missing", () => {
    expect(() => requirePermission(context, "cash:manage")).toThrow(ForbiddenException);
  });

  it("rejects tenant overrides sent by private endpoint clients", () => {
    expect(() => rejectTenantOverride({ tenantId: "tenant-b", name: "Produto" })).toThrow(
      BadRequestException,
    );
    expect(() => rejectTenantOverride({ tenant_id: "tenant-b", name: "Produto" })).toThrow(
      BadRequestException,
    );
  });

  it("allows ordinary request bodies without tenant hints", () => {
    expect(() => rejectTenantOverride({ name: "Produto", priceCents: 3200 })).not.toThrow();
  });
});
