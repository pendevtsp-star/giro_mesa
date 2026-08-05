import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { TenantsService } from "./tenants.service";

describe("TenantsService branding read boundary", () => {
  it("normalizes persisted branding without leaking invalid settings", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "tenant-a",
        name: "Tenant fallback",
        settings: {
          branding: {
            displayName: "  Unidade Centro  ",
            logoUrl: "https://cdn.example.test/logo.png",
            themeMode: "system",
            accentPreset: "violet",
          },
        },
      },
    ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
    };
    const service = new TenantsService({ db } as unknown as DatabaseService);

    await expect(
      service.getBranding({
        tenantId: "tenant-a",
        userId: "user-a",
        requestId: "request-a",
        permissions: [],
      }),
    ).resolves.toEqual({
      displayName: "Unidade Centro",
      logoUrl: "https://cdn.example.test/logo.png",
      themeMode: "system",
      accentPreset: "violet",
    });
  });

  it("falls back to safe defaults for malformed branding", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([
        { id: "tenant-a", name: "Tenant fallback", settings: { branding: "invalid" } },
      ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
    };
    const service = new TenantsService({ db } as unknown as DatabaseService);

    await expect(
      service.getBranding({
        tenantId: "tenant-a",
        userId: "user-a",
        requestId: "request-a",
        permissions: [],
      }),
    ).resolves.toEqual({
      displayName: "Tenant fallback",
      logoUrl: null,
      themeMode: "light",
      accentPreset: "emerald",
    });
  });
});
