import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { enqueueClubWhiskyProductUpdated } from "./club-whisky-events";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = "11111111-1111-4111-8111-111111111111";

function queryResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
    })),
  };
}

function eventClient(ownedBranches: Array<{ id: string }>) {
  const values = vi.fn(async () => []);
  const client = {
    select: vi
      .fn()
      .mockReturnValueOnce(queryResult([{ config: { branchId } }]))
      .mockReturnValueOnce(queryResult(ownedBranches)),
    insert: vi.fn(() => ({ values })),
  };
  return { client: client as unknown as DatabaseService["db"], values };
}

const product = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Whisky teste",
  description: null,
  priceCents: 10_000,
  isActive: true,
  isAvailable: true,
  isClubEligible: true,
  bottleVolumeMl: 1_000,
  defaultDoseMl: 50,
  spiritType: "whisky",
  channels: ["pos"],
  updatedAt: new Date("2026-08-03T00:00:00.000Z"),
};

describe("Dose Club outbox branch ownership", () => {
  it("does not emit for a nonexistent or cross-tenant legacy branch", async () => {
    const { client, values } = eventClient([]);
    await expect(
      enqueueClubWhiskyProductUpdated(
        client,
        { tenantId, requestId: "event-test", permissions: [] },
        product,
        "updated",
      ),
    ).resolves.toBe(false);
    expect(values).not.toHaveBeenCalled();
  });

  it("emits with the exact tenant-owned branch", async () => {
    const { client, values } = eventClient([{ id: branchId }]);
    await expect(
      enqueueClubWhiskyProductUpdated(
        client,
        { tenantId, requestId: "event-valid", permissions: [] },
        product,
        "updated",
      ),
    ).resolves.toBe(true);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ branchId }) }),
    );
  });
});
