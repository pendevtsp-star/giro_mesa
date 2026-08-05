import { readFile } from "node:fs/promises";

export async function loadSecurityExceptions(path, scanner, now = Date.now()) {
  const registry = JSON.parse(await readFile(path, "utf8"));
  const entries = registry.exceptions ?? [];
  if (!Array.isArray(entries)) {
    throw new Error(`${scanner} exception registry must contain an exceptions array`);
  }

  const validated = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${scanner} exception entries must be objects`);
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const owner = typeof entry.owner === "string" ? entry.owner.trim() : "";
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    const expiresAt = typeof entry.expiresAt === "string" ? entry.expiresAt.trim() : "";
    const expiresAtMs = Date.parse(expiresAt);
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,}$/.test(id)) {
      throw new Error(`${scanner} exception requires an exact finding id without wildcards`);
    }
    if (!owner || !reason || !expiresAt || !Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      throw new Error(`${scanner} exception ${id} requires owner, reason and a future expiry`);
    }
    if (validated.has(id)) {
      throw new Error(`${scanner} exception ${id} is duplicated`);
    }
    validated.set(id, { id, owner, reason, expiresAt });
  }
  return validated;
}
