import { spawnSync } from "node:child_process";

const pnpmExecPath = process.env.npm_execpath;
const directWindows = !pnpmExecPath && process.platform === "win32";
const command = pnpmExecPath ? process.execPath : directWindows ? "cmd.exe" : "pnpm";

const env = {
  ...process.env,
  RUN_DB_INTEGRATION_TESTS: "true",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.CI
      ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
      : "postgres://giromesa:giromesa@localhost:55432/giromesa"),
};

function run(args) {
  const commandArgs = pnpmExecPath
    ? [pnpmExecPath, ...args]
    : directWindows
      ? ["/d", "/c", "pnpm", ...args]
      : args;
  return spawnSync(command, commandArgs, {
    env,
    stdio: "inherit",
  });
}

for (const packageName of ["@giromesa/domain", "@giromesa/db"]) {
  const build = run(["--filter", packageName, "build"]);
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const migration = run(["db:migrate"]);
if (migration.status !== 0) {
  const applied = run(["--filter", "@giromesa/db", "db:check-applied"]);
  if (applied.status !== 0) {
    process.exit(migration.status ?? applied.status ?? 1);
  }
}

for (const args of [
  [
    "--filter",
    "@giromesa/api",
    "exec",
    "vitest",
    "run",
    "src/modules/integrations/club-whisky.integration.test.ts",
    "src/modules/fiscal/fiscal.integration.test.ts",
    "src/modules/printing/connector-auth.integration.test.ts",
    "src/modules/qr/qr.integration.test.ts",
    "src/modules/pos/operational-foundation.integration.test.ts",
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
  const result = run(args);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
