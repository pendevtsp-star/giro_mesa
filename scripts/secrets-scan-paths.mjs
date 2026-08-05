import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["provider-key", /\b(?:re|sk)_[A-Za-z0-9_-]{16,}\b/],
];
const historyPatterns = [
  ["private-key", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"],
  ["provider-key", "(^|[^A-Za-z0-9_])(re|sk)_[A-Za-z0-9_-]{16,}([^A-Za-z0-9_]|$)"],
];
const allowedExtensions = /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|md|env|sh)$/i;
const allowlist = JSON.parse(await readFile("security/secret-scan-allowlist.json", "utf8"));
const now = Date.now();
const allowed = new Set(
  (allowlist.entries ?? [])
    .filter(
      (entry) => entry.path && entry.type && entry.reason && Date.parse(entry.expiresAt) > now,
    )
    .map((entry) => `${entry.path}:${entry.type}`),
);
const findings = new Map();

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean);
for (const path of [...tracked, ...untracked]) {
  if (!scannable(path)) continue;
  const content = await readFile(path, "utf8").catch(() => null);
  if (content !== null)
    classify(path, untracked.includes(path) ? "untracked" : "snapshot", content);
}

const commits = git(["rev-list", "--all"]).split(/\r?\n/).filter(Boolean);
for (let offset = 0; offset < commits.length; offset += 25) {
  const batch = commits.slice(offset, offset + 25);
  for (const [type, pattern] of historyPatterns) {
    const matches = git(["grep", "-I", "-l", "-E", "-e", pattern, ...batch, "--"], true);
    for (const line of matches.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      const path = line.slice(colon + 1);
      if (scannable(path) && !allowed.has(`${path}:${type}`)) {
        findings.set(`${path}:${type}`, { path, type });
      }
    }
  }
}

const output = [...findings.values()].sort(
  (a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type),
);
console.log(JSON.stringify({ findings: output }, null, 2));
if (output.length) process.exitCode = 1;

function classify(path, _scope, content) {
  for (const [type, pattern] of patterns) {
    if (pattern.test(content) && !allowed.has(`${path}:${type}`)) {
      findings.set(`${path}:${type}`, { path, type });
    }
  }
}

function scannable(path) {
  return (
    allowedExtensions.test(path) &&
    !path.includes("node_modules/") &&
    !path.endsWith("pnpm-lock.yaml")
  );
}

function git(args, allowFailure = false) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure && error?.status === 1) return error.stdout?.toString() ?? "";
    throw error;
  }
}
