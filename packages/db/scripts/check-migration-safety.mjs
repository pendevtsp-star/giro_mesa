import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const journal = JSON.parse(
  await readFile(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"),
);
const destructivePattern = /\b(?:drop\s+(?:table|column|schema|type)|truncate\s+table)\b/giu;
const violations = [];

// Migration 0012 predates this guard. Every migration from the hybrid-operation
// foundation forward must be additive or use a separately reviewed backfill.
for (const entry of journal.entries.filter((item) => item.idx >= 13)) {
  const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
  const sql = await readFile(sqlPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  statements.forEach((statement, index) => {
    if (destructivePattern.test(statement)) {
      violations.push(`${entry.tag} statement ${index + 1}`);
    }
    destructivePattern.lastIndex = 0;
  });
}

if (violations.length > 0) {
  console.error(`Destructive migration statements found: ${violations.join(", ")}`);
  process.exit(1);
}

console.log("Migration safety gate passed.");
