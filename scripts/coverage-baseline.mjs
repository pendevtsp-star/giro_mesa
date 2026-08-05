import { readFile } from "node:fs/promises";

const summary = JSON.parse(await readFile("coverage/coverage-summary.json", "utf8"));
const baselines = JSON.parse(await readFile("security/coverage-baselines.json", "utf8"));
const results = {};
for (const [domain, baseline] of Object.entries(baselines)) {
  const files = Object.entries(summary).filter(
    ([path]) => path !== "total" && path.replaceAll("\\", "/").includes(baseline.path),
  );
  const covered = files.reduce((sum, [, value]) => sum + value.lines.covered, 0);
  const total = files.reduce((sum, [, value]) => sum + value.lines.total, 0);
  const pct = total ? (covered / total) * 100 : 0;
  results[domain] = { files: files.length, lines: Number(pct.toFixed(2)), minimum: baseline.lines };
}
console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((result) => result.files === 0 || result.lines < result.minimum))
  process.exitCode = 1;
