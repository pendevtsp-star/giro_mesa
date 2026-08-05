import { execFileSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("security:cases must be run through pnpm");
execFileSync(
  process.execPath,
  [
    pnpmCli,
    "--filter",
    "@giromesa/api",
    "exec",
    "vitest",
    "run",
    "src/common/security-cases.test.ts",
    "src/common/csrf.test.ts",
    "src/common/webhook-signature.test.ts",
    "src/common/email-provider.test.ts",
    "--pool=threads",
    "--maxWorkers=1",
    "--minWorkers=1",
  ],
  { stdio: "inherit" },
);
