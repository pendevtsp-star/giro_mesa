#!/usr/bin/env node

/**
 * Creates a throwaway F16 capacity dataset. It is deliberately impossible to
 * run against a production or shared development database.
 *
 * The normal demo seed remains the source of truth for the base tenant. This
 * script only expands that tenant after the base seed completed successfully.
 */

import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { Client } = requireDb("pg");
const argon2 = requireDb("argon2");

const DEMO_TENANT = "bar-aurora-demo";
const OPERATOR_COUNT = 12;
const TABLE_COUNT = 120;
const SSE_GUEST_COUNT = 600;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertLocalF16Database(databaseUrl = process.env.DATABASE_URL) {
  if (process.env.F16_LOAD_SEED !== "1") {
    throw new Error("Refusing F16 seed: set F16_LOAD_SEED=1 explicitly");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing F16 seed in production");
  }
  const parsed = new URL(required(databaseUrl, "DATABASE_URL"));
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error("Refusing F16 seed outside a local PostgreSQL host");
  }
  const databaseName = parsed.pathname.replace(/^\//, "");
  const dedicatedTopologyDatabase =
    process.env.F16_LOAD_TOPOLOGY_STACK === "1" && databaseName === "giromesa_ab";
  if (!databaseName.startsWith("giromesa_f16_") && !dedicatedTopologyDatabase) {
    throw new Error("Refusing F16 seed outside a giromesa_f16_* database");
  }
  return parsed;
}

function f16TableCode(index) {
  return `F${String(index).padStart(3, "0")}`;
}

function signedQrToken({ tenantId, branchId, tableId, version }) {
  const secret = required(process.env.QR_SIGNING_SECRET, "QR_SIGNING_SECRET");
  const encoded = Buffer.from(JSON.stringify({ tenantId, branchId, tableId, version })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pnpmInvocation(args) {
  if (process.env.npm_execpath)
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (process.platform === "win32")
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "pnpm", ...args] };
  return { command: "pnpm", args };
}

function run(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) return resolveRun();
      rejectRun(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function seedBaseDataset() {
  const invocation = pnpmInvocation(["--filter", "@giromesa/db", "db:seed"]);
  await run(invocation.command, invocation.args, process.env);
}

async function clearPriorF16Artifacts() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tenantResult = await client.query("select id from tenants where slug = $1 limit 1", [
      DEMO_TENANT,
    ]);
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) return;

    // The base demo seed predates QR service sessions. Clearing only the
    // disposable tenant's dependent rows lets its normal reset stay idempotent
    // without changing production seed behavior.
    await client.query("delete from service_requests where tenant_id = $1", [tenantId]);
    await client.query(
      "update order_items set table_service_session_id = null, qr_guest_session_id = null where tenant_id = $1",
      [tenantId],
    );
    await client.query("delete from qr_guest_access_requests where tenant_id = $1", [tenantId]);
    await client.query("delete from qr_guest_sessions where tenant_id = $1", [tenantId]);
    await client.query("delete from table_service_sessions where tenant_id = $1", [tenantId]);
    await client.query("delete from table_waiter_assignments where tenant_id = $1", [tenantId]);
  } finally {
    await client.end();
  }
}

async function extendDataset() {
  const databaseUrl = process.env.DATABASE_URL;
  const password = required(process.env.SEED_TEST_PASSWORD, "SEED_TEST_PASSWORD");
  const pepper = required(process.env.PASSWORD_PEPPER, "PASSWORD_PEPPER");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tenantResult = await client.query("select id from tenants where slug = $1 limit 1", [
      DEMO_TENANT,
    ]);
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) throw new Error("Base demo tenant was not seeded");

    const branchResult = await client.query(
      "select id from branches where tenant_id = $1 and is_active = true order by created_at limit 1",
      [tenantId],
    );
    const branchId = branchResult.rows[0]?.id;
    if (!branchId) throw new Error("Base demo branch was not seeded");

    const floorPlanResult = await client.query(
      "select id from floor_plans where tenant_id = $1 and branch_id = $2 order by created_at limit 1",
      [tenantId, branchId],
    );
    const floorPlanId = floorPlanResult.rows[0]?.id;
    if (!floorPlanId) throw new Error("Base floor plan was not seeded");

    const roleResult = await client.query(
      "select id from roles where tenant_id = $1 and code = 'owner' limit 1",
      [tenantId],
    );
    const ownerRoleId = roleResult.rows[0]?.id;
    if (!ownerRoleId) throw new Error("Base owner role was not seeded");

    const passwordHash = await argon2.hash(`${password}${pepper}`, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    for (let index = 1; index <= OPERATOR_COUNT; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const email = `f16-load-${suffix}@${DEMO_TENANT}.local`;
      const userResult = await client.query(
        `insert into users (tenant_id, email, name, password_hash, mfa_enabled, is_platform_user, is_active)
         values ($1, $2, $3, $4, false, false, true)
         on conflict (email, tenant_id) do update
           set name = excluded.name, password_hash = excluded.password_hash, is_active = true, updated_at = now()
         returning id`,
        [tenantId, email, `F16 operador ${suffix}`, passwordHash],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error(`Unable to create F16 operator ${suffix}`);
      await client.query("delete from user_roles where tenant_id = $1 and user_id = $2", [
        tenantId,
        userId,
      ]);
      await client.query(
        "insert into user_roles (tenant_id, user_id, role_id, branch_id) values ($1, $2, $3, $4)",
        [tenantId, userId, ownerRoleId, branchId],
      );
    }

    const layout = {};
    const tableIds = [];
    for (let index = 1; index <= TABLE_COUNT; index += 1) {
      const code = f16TableCode(index);
      const tableResult = await client.query(
        `insert into dining_tables
          (tenant_id, branch_id, floor_plan_id, code, name, seats, shape, status, archived_at, qr_status)
         values ($1, $2, $3, $4, $5, 4, 'rounded', 'free', null, 'active')
         on conflict (branch_id, code) do update
           set name = excluded.name, seats = excluded.seats, shape = excluded.shape, status = 'free',
               archived_at = null, qr_status = 'active', updated_at = now()
         returning id, qr_token_version`,
        [tenantId, branchId, floorPlanId, code, `Mesa F16 ${index}`],
      );
      const table = tableResult.rows[0];
      if (!table) throw new Error(`Unable to create ${code}`);
      tableIds.push(table.id);
      layout[table.id] = {
        x: ((index - 1) % 12) * 10 + 4,
        y: Math.floor((index - 1) / 12) * 12 + 4,
      };
    }
    await client.query(
      "update floor_plans set layout = $1::jsonb, updated_at = now(), version = version + 1 where id = $2",
      [JSON.stringify(layout), floorPlanId],
    );

    const primaryTableResult = await client.query(
      `select id, qr_token_version from dining_tables
       where tenant_id = $1 and branch_id = $2 and code = 'M03' limit 1`,
      [tenantId, branchId],
    );
    const primaryTableId = primaryTableResult.rows[0]?.id;
    const version = primaryTableResult.rows[0]?.qr_token_version;
    if (!primaryTableId || !version) throw new Error("F16 primary QR table was not created");
    const qrToken = signedQrToken({ tenantId, branchId, tableId: primaryTableId, version });
    await client.query("update dining_tables set qr_token_hash = $1 where id = $2", [
      hash(qrToken),
      primaryTableId,
    ]);

    const sessionResult = await client.query(
      `insert into table_service_sessions
        (tenant_id, branch_id, table_id, status, mode, capabilities, presence_methods, tab_visibility,
         guest_session_ttl_minutes, presence_code_attempts)
       values ($1, $2, $3, 'active', 'waiter_assisted', '[]'::jsonb, '["code"]'::jsonb, 'shared', 720, 0)
       returning id`,
      [tenantId, branchId, primaryTableId],
    );
    const tableServiceSessionId = sessionResult.rows[0]?.id;
    if (!tableServiceSessionId) throw new Error("Unable to create F16 QR service session");
    const guestTokens = Array.from({ length: SSE_GUEST_COUNT }, () =>
      randomBytes(32).toString("base64url"),
    );
    await client.query(
      `insert into qr_guest_sessions
        (tenant_id, branch_id, table_service_session_id, token_hash, validation_method, expires_at, last_used_at)
       select $1, $2, $3, token_hash, 'code', now() + interval '12 hours', now()
       from unnest($4::text[]) as token_hash`,
      [tenantId, branchId, tableServiceSessionId, guestTokens.map(hash)],
    );

    const productResult = await client.query(
      "select id from products where tenant_id = $1 and is_active = true order by created_at limit 1",
      [tenantId],
    );
    const stationResult = await client.query(
      "select id from kds_stations where tenant_id = $1 and branch_id = $2 order by created_at limit 1",
      [tenantId, branchId],
    );
    const productId = productResult.rows[0]?.id;
    const stationId = stationResult.rows[0]?.id;
    if (!productId || !stationId) throw new Error("Base product or KDS station was not seeded");

    return { branchId, productId, stationId, tableIds, qrToken, guestTokens };
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const previousSeedFlag = process.env.F16_LOAD_SEED;
    process.env.F16_LOAD_SEED = "1";
    const parsed = assertLocalF16Database(
      "postgres://local:local@localhost:55448/giromesa_f16_selftest",
    );
    if (parsed.port !== "55448" || f16TableCode(1) !== "F001" || f16TableCode(120) !== "F120") {
      throw new Error("F16 seed self-check failed");
    }
    for (const invalid of [
      "postgres://local:local@db.internal:5432/giromesa_f16_load",
      "postgres://local:local@localhost:55448/giromesa",
    ]) {
      try {
        assertLocalF16Database(invalid);
      } catch {
        continue;
      }
      throw new Error("F16 seed safety self-check failed");
    }
    if (previousSeedFlag === undefined) delete process.env.F16_LOAD_SEED;
    else process.env.F16_LOAD_SEED = previousSeedFlag;
    console.log("seed-f16-load self-check passed");
    return;
  }

  assertLocalF16Database();
  await clearPriorF16Artifacts();
  await seedBaseDataset();
  const result = await extendDataset();
  const env = [
    `PILOT_LOAD_BRANCH_ID=${result.branchId}`,
    `PILOT_LOAD_PRODUCT_ID=${result.productId}`,
    `PILOT_LOAD_STATION_ID=${result.stationId}`,
    `PILOT_LOAD_QR_TOKEN=${result.qrToken}`,
    `PILOT_LOAD_QR_GUEST=${result.guestTokens[0]}`,
    ...result.tableIds.map(
      (id, index) => `PILOT_LOAD_TABLE_${String(index + 1).padStart(3, "0")}=${id}`,
    ),
    ...result.guestTokens.map(
      (token, index) => `PILOT_LOAD_QR_GUEST_${String(index + 1).padStart(3, "0")}=${token}`,
    ),
  ];
  for (let index = 1; index <= OPERATOR_COUNT; index += 1) {
    env.push(
      `PILOT_LOAD_OPERATOR_${String(index).padStart(2, "0")}=f16-load-${String(index).padStart(2, "0")}@${DEMO_TENANT}.local`,
    );
  }
  const outputFile = required(process.env.F16_LOAD_ENV_FILE, "F16_LOAD_ENV_FILE");
  const temporaryRoot = resolve(tmpdir());
  const resolvedOutput = resolve(outputFile);
  if (relative(temporaryRoot, resolvedOutput).startsWith("..")) {
    throw new Error("F16_LOAD_ENV_FILE must be inside the operating-system temporary directory");
  }
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${env.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        status: "ready",
        database: new URL(process.env.DATABASE_URL).pathname,
        operators: OPERATOR_COUNT,
        tables: TABLE_COUNT,
        sseGuestSessions: SSE_GUEST_COUNT,
        loadEnvironmentFile: resolvedOutput,
        loadEnvironmentLines: env.length,
        note: "Operator sessions are minted by scripts/mint-f16-load-sessions.mjs after the local API starts.",
      },
      null,
      2,
    ),
  );
}

await main();
