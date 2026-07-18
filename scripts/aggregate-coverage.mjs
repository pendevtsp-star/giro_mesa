import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaries = await glob("{apps,packages}/*/coverage/coverage-summary.json", {
  cwd: root,
  nodir: true,
});

if (summaries.length === 0) {
  throw new Error("No coverage summaries found. Run pnpm test:coverage from the repository root.");
}

const totals = {
  lines: { total: 0, covered: 0, skipped: 0 },
  statements: { total: 0, covered: 0, skipped: 0 },
  functions: { total: 0, covered: 0, skipped: 0 },
  branches: { total: 0, covered: 0, skipped: 0 },
};
const packages = [];

for (const summaryPath of summaries.sort()) {
  const summary = JSON.parse(await readFile(resolve(root, summaryPath), "utf8"));
  const packageTotal = summary.total;
  packages.push({
    package: relative(root, resolve(root, summaryPath, "..", "..")),
    total: packageTotal,
  });

  for (const metric of Object.keys(totals)) {
    totals[metric].total += packageTotal[metric]?.total ?? 0;
    totals[metric].covered += packageTotal[metric]?.covered ?? 0;
    totals[metric].skipped += packageTotal[metric]?.skipped ?? 0;
  }
}

for (const metric of Object.keys(totals)) {
  const item = totals[metric];
  item.pct = item.total === 0 ? 100 : Number(((item.covered / item.total) * 100).toFixed(2));
}

const output = {
  total: totals,
  packages,
};

await mkdir(resolve(root, "coverage"), { recursive: true });
await writeFile(
  resolve(root, "coverage", "coverage-summary.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("Aggregated coverage summary");
for (const metric of Object.keys(totals)) {
  console.log(`${metric}: ${totals[metric].pct}%`);
}
