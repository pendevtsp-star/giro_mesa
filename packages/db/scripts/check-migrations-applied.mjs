import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));
const expected = [];

for (const entry of journal.entries) {
  const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
  const sql = await readFile(sqlPath);
  expected.push({
    hash: createHash("sha256").update(sql).digest("hex"),
    id: entry.idx + 1,
    tag: entry.tag,
  });
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

try {
  const result = await client.query(
    "select id, hash from drizzle.__drizzle_migrations order by id",
  );
  const applied = new Map(result.rows.map((row) => [Number(row.id), row.hash]));

  for (const migration of expected) {
    const appliedHash = applied.get(migration.id);
    if (appliedHash !== migration.hash) {
      console.error(`Migration ${migration.tag} is not applied with the expected hash.`);
      process.exit(1);
    }
  }

  console.log(`${expected.length} migrations already applied with matching hashes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end();
}
