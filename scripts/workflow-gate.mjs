import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const deploy = parse(await readFile(".github/workflows/deploy-production.yml", "utf8"));
const trivy = parse(await readFile(".github/workflows/security-trivy.yml", "utf8"));

const deploySteps = deploy?.jobs?.validate?.steps;
if (!Array.isArray(deploySteps)) throw new Error("Deploy validate steps are missing");
const requiredCommands = [
  "pnpm security:preflight",
  "pnpm security:cases",
  "pnpm security:high",
  "node scripts/secrets-scan-paths.mjs",
  "pnpm test:coverage",
  "pnpm coverage:baseline",
  "pnpm security:trivy-exceptions",
];
for (const command of requiredCommands) requireBlockingRun(deploySteps, command);
requireTrivySteps(deploySteps, "deploy validate");

const publishNeeds = asNeeds(deploy?.jobs?.["publish-images"]?.needs);
if (!publishNeeds.includes("validate")) {
  throw new Error("publish-images must depend on the same-SHA validate job");
}
const deployNeeds = asNeeds(deploy?.jobs?.deploy?.needs);
if (!deployNeeds.includes("publish-images")) {
  throw new Error("deploy must depend on publish-images");
}

const trivySteps = trivy?.jobs?.trivy?.steps;
if (!Array.isArray(trivySteps)) throw new Error("Trivy workflow steps are missing");
requireBlockingRun(trivySteps, "pnpm security:trivy-exceptions");
requireTrivySteps(trivySteps, "security-trivy");

console.log(
  JSON.stringify({
    deploySameShaGate: true,
    publishDependsOnValidate: true,
    trivyHighCriticalBlocking: true,
  }),
);

function requireBlockingRun(steps, command) {
  const step = steps.find((candidate) => candidate?.run === command);
  if (!step) throw new Error(`Required workflow command is missing: ${command}`);
  if (step["continue-on-error"] === true) {
    throw new Error(`Required workflow command cannot continue on error: ${command}`);
  }
}

function requireTrivySteps(steps, workflow) {
  const scans = steps.filter((step) =>
    String(step?.uses ?? "").startsWith("aquasecurity/trivy-action@"),
  );
  const scanTypes = new Set(scans.map((step) => step?.with?.["scan-type"]));
  if (!scanTypes.has("fs") || !scanTypes.has("config")) {
    throw new Error(`${workflow} must run both Trivy fs and config scans`);
  }
  for (const scan of scans) {
    const severity = String(scan?.with?.severity ?? "")
      .split(",")
      .map((value) => value.trim());
    if (!severity.includes("HIGH") || !severity.includes("CRITICAL")) {
      throw new Error(`${workflow} Trivy scan must include HIGH and CRITICAL`);
    }
    if (String(scan?.with?.["exit-code"]) !== "1") {
      throw new Error(`${workflow} Trivy scan must fail with exit-code 1`);
    }
    if (scan?.with?.["ignore-unfixed"] !== false) {
      throw new Error(`${workflow} Trivy scan cannot ignore unfixed findings`);
    }
    if (scan?.with?.trivyignores !== ".trivyignore.generated") {
      throw new Error(`${workflow} Trivy scan must use the validated exact exception file`);
    }
    if (scan?.["continue-on-error"] === true) {
      throw new Error(`${workflow} Trivy scan cannot continue on error`);
    }
  }
}

function asNeeds(value) {
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}
