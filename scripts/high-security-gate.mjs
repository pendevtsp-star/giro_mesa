import { execFileSync } from "node:child_process";
import { loadSecurityExceptions } from "./security-exceptions.mjs";

const exceptions = await loadSecurityExceptions("security/high-exceptions.json", "Dependency");
const trivyExceptions = await loadSecurityExceptions("security/trivy-exceptions.json", "Trivy");

let audit;
try {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("security:high must be run through pnpm");
  audit = JSON.parse(
    execFileSync(process.execPath, [pnpmCli, "audit", "--json", "--audit-level", "high"], {
      encoding: "utf8",
    }),
  );
} catch (error) {
  const output = error?.stdout?.toString();
  if (!output) throw error;
  audit = JSON.parse(output);
}
const advisories = Object.values(audit.advisories ?? audit.vulnerabilities ?? {});
const highOrCritical = advisories.filter(
  (item) => item.severity === "high" || item.severity === "critical",
);
const blocking = [
  ...new Set(
    highOrCritical
      .map((item) =>
        String(item.github_advisory_id ?? item.id ?? item.via?.[0]?.source ?? "unknown"),
      )
      .filter((id) => !exceptions.has(id)),
  ),
];
console.log(
  JSON.stringify(
    {
      highOrCritical: highOrCritical.length,
      blockingIds: blocking,
      validatedDependencyExceptions: exceptions.size,
      validatedTrivyExceptions: trivyExceptions.size,
    },
    null,
    2,
  ),
);
if (blocking.length) process.exitCode = 1;
