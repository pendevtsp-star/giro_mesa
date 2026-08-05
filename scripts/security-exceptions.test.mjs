import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSecurityExceptions } from "./security-exceptions.mjs";

describe("security exception policy", () => {
  it("accepts exact, owned and unexpired findings", async () => {
    const path = await registry([
      {
        id: "CVE-2026-12345",
        owner: "security@example.test",
        reason: "Compensating control is documented",
        expiresAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const entries = await loadSecurityExceptions(path, "Trivy", Date.parse("2026-08-05"));
    expect(entries.get("CVE-2026-12345")).toMatchObject({ owner: "security@example.test" });
  });

  it.each([
    [{ id: "CVE-*", owner: "security", reason: "x", expiresAt: "2026-09-01" }],
    [{ id: "CVE-2026-12345", owner: "", reason: "x", expiresAt: "2026-09-01" }],
    [{ id: "CVE-2026-12345", owner: "security", reason: "x", expiresAt: "2026-08-01" }],
    [
      { id: "CVE-2026-12345", owner: "security", reason: "x", expiresAt: "2026-09-01" },
      { id: "CVE-2026-12345", owner: "security", reason: "x", expiresAt: "2026-09-01" },
    ],
  ])("rejects malformed, expired or duplicate entries", async (...entries) => {
    const path = await registry(entries);
    await expect(loadSecurityExceptions(path, "Trivy", Date.parse("2026-08-05"))).rejects.toThrow();
  });
});

async function registry(exceptions) {
  const directory = await mkdtemp(join(tmpdir(), "giromesa-security-exceptions-"));
  const path = join(directory, "registry.json");
  await writeFile(path, JSON.stringify({ exceptions }));
  return path;
}
