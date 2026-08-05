import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const rootPath = fileURLToPath(rootUrl);

try {
  loadEnvFile(fileURLToPath(new URL(".env", rootUrl)));
} catch {
  // CI can provide every variable directly.
}

const apiPort = Number(process.env.E2E_API_PORT ?? 3334);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3106);
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const databaseUrl = resolveE2eDatabaseUrl();
const testPassword = process.env.SEED_TEST_PASSWORD ?? `E2E-${randomBytes(12).toString("hex")}!`;
const platformPassword =
  process.env.SEED_PLATFORM_PASSWORD ?? `Platform-E2E-${randomBytes(12).toString("hex")}!`;
const runtimeEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  API_PORT: String(apiPort),
  API_URL: apiUrl,
  APP_URL: webUrl,
  PUBLIC_APP_URL: webUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_DIST_DIR: ".next-e2e",
  WEB_URL: webUrl,
  GIROMESA_QA_START_COMMAND: `pnpm --filter @giromesa/web start --hostname localhost --port ${webPort}`,
  GIROMESA_QA_START_MODE: "next-start",
  PLAYWRIGHT_SKIP_WEB_SERVER: "1",
  PLAYWRIGHT_REUSE_EXISTING_SERVER: "0",
  SEED_TEST_PASSWORD: testPassword,
  SEED_PLATFORM_PASSWORD: platformPassword,
  E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD ?? testPassword,
  E2E_PLATFORM_PASSWORD: process.env.E2E_PLATFORM_PASSWORD ?? platformPassword,
  LEGAL_TERMS_VERSION: "e2e-2026-08-03",
  LEGAL_TERMS_SHA256: "a".repeat(64),
  LEGAL_PRIVACY_VERSION: "e2e-2026-08-03",
  LEGAL_PRIVACY_SHA256: "b".repeat(64),
  // The legacy M03 fixture is intentionally enabled only inside the isolated E2E tenant.
  LEGACY_QR_ENABLED: process.env.LEGACY_QR_ENABLED ?? "true",
  LEGACY_QR_TENANT_SLUG: process.env.LEGACY_QR_TENANT_SLUG ?? "bar-aurora-demo",
};

const children = [];
let shuttingDown = false;
const playwrightArgs = process.argv.slice(2);
if (playwrightArgs[0] === "--") {
  playwrightArgs.shift();
}

try {
  await assertPortAvailable(apiPort);
  await assertPortAvailable(webPort);
  await recreateE2eDatabase(databaseUrl);

  runPnpm(["db:migrate"], runtimeEnv);
  runPnpm(["--filter", "@giromesa/db", "db:seed"], runtimeEnv);
  runPnpm(["build"], { ...runtimeEnv, NODE_ENV: "production" });

  const api = spawnPnpm(["--filter", "@giromesa/api", "start"], runtimeEnv);
  children.push(api);
  await waitFor(`${apiUrl}/health/ready`, "API E2E");

  const web = spawnPnpm(
    ["--filter", "@giromesa/web", "start", "--hostname", "localhost", "--port", String(webPort)],
    { ...runtimeEnv, NODE_ENV: "production" },
  );
  children.push(web);
  await waitFor(webUrl, "Web E2E");

  runPnpm(["exec", "playwright", "test", ...playwrightArgs], runtimeEnv);
} finally {
  await shutdown();
}

function resolveE2eDatabaseUrl() {
  const source =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://giromesa:giromesa@localhost:55432/giromesa";
  const url = new URL(source);

  if (!process.env.E2E_DATABASE_URL) {
    url.pathname = "/giromesa_e2e";
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (databaseName !== "giromesa_e2e") {
    throw new Error(
      `E2E_DATABASE_URL deve apontar exclusivamente para "giromesa_e2e"; recebido "${databaseName}".`,
    );
  }

  return url.toString();
}

async function recreateE2eDatabase(connectionString) {
  const requireFromDbPackage = createRequire(
    new URL("../packages/db/package.json", import.meta.url),
  );
  const { Client } = requireFromDbPackage("pg");
  const targetUrl = new URL(connectionString);
  const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }

  console.log(`Banco E2E recriado: ${databaseName}`);
}

function pnpmInvocation(args) {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath) {
    return { command: process.execPath, args: [pnpmExecPath, ...args] };
  }
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "pnpm", ...args] };
  }
  return { command: "pnpm", args };
}

function runPnpm(args, env) {
  const invocation = pnpmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootPath,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Comando falhou: pnpm ${args.join(" ")}`);
  }
}

function spawnPnpm(args, env) {
  const invocation = pnpmInvocation(args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: rootPath,
    env,
    stdio: "inherit",
  });
  child.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Processo encerrou antes do esperado: pnpm ${args.join(" ")} (${code ?? "?"})`);
    }
  });
  return child;
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`A porta E2E ${port} já está em uso.`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function waitFor(url, label) {
  const deadline = Date.now() + 120_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`${label} pronto em ${url}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${label} não ficou pronto em 120s: ${lastError}`);
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children.reverse()) {
    if (child.exitCode !== null || child.pid === undefined) {
      continue;
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
}
