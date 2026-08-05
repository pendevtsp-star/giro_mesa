import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));
const expected = [];
const repairedBy0044 = new Set([
  "0029_serious_butterfly",
  "0030_living_shinobi_shaw",
  "0031_lovely_husk",
]);

for (const entry of journal.entries) {
  const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
  const sql = await readFile(sqlPath);
  expected.push({
    hash: createHash("sha256").update(sql).digest("hex"),
    tag: entry.tag,
  });
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

try {
  const result = await client.query("select hash from drizzle.__drizzle_migrations");
  const applied = new Set(result.rows.map((row) => row.hash));
  const repairHash = expected.find(
    (migration) => migration.tag === "0044_repair_skipped_operational_schema",
  )?.hash;

  for (const migration of expected) {
    if (applied.has(migration.hash)) continue;
    if (repairHash && applied.has(repairHash) && repairedBy0044.has(migration.tag)) {
      continue;
    }
    console.error(`Migration ${migration.tag} is not applied with the expected hash.`);
    process.exit(1);
  }

  console.log(`${expected.length} migrations already applied with matching hashes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end();
}
