import { spawnSync } from "node:child_process";

const pnpmExecPath = process.env.npm_execpath;
const command = pnpmExecPath ? process.execPath : "pnpm";

const env = {
  ...process.env,
  RUN_DB_INTEGRATION_TESTS: "true",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.CI
      ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
      : "postgres://giromesa:giromesa@localhost:55432/giromesa"),
};

for (const args of [
  ["db:migrate"],
  [
    "--filter",
    "@giromesa/api",
    "exec",
    "vitest",
    "run",
    "src/modules/integrations/club-whisky.integration.test.ts",
    "src/modules/fiscal/fiscal.integration.test.ts",
    "src/modules/printing/connector-auth.integration.test.ts",
    "--pool=threads",
    "--maxWorkers=1",
    "--minWorkers=1",
  ],
  [
    "--filter",
    "@giromesa/worker",
    "exec",
    "vitest",
    "run",
    "src/outbox.integration.test.ts",
    "src/fiscal.integration.test.ts",
    "--pool=threads",
    "--maxWorkers=1",
    "--minWorkers=1",
  ],
]) {
  const result = spawnSync(command, pnpmExecPath ? [pnpmExecPath, ...args] : args, {
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
