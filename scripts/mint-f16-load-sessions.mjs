#!/usr/bin/env node

/**
 * Mints the 12 disposable operator cookies after the isolated F16 API has
 * started. Credentials and cookies stay in the local temporary env file.
 */

import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const OPERATOR_COUNT = 12;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertLocalApi(value) {
  if (process.env.F16_LOAD_SEED !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("F16 session minting is restricted to the explicit local F16 gate");
  }
  const url = new URL(value);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("F16 session minting only accepts a local API URL");
  }
  return url;
}

function parseEnv(source) {
  return new Map(
    source
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
      .filter(([key]) => key),
  );
}

function getSessionCookie(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const cookie = values.find((value) => value.startsWith("gm_session="));
  if (!cookie) throw new Error("API login did not return a gm_session cookie");
  return cookie.split(";", 1)[0];
}

async function main() {
  if (process.argv.includes("--self-test")) {
    process.env.F16_LOAD_SEED = "1";
    const target = assertLocalApi("http://127.0.0.1:3348");
    if (target.port !== "3348" || parseEnv("A=1\nB=two\n").get("B") !== "two") {
      throw new Error("F16 session mint self-check failed");
    }
    console.log("mint-f16-load-sessions self-check passed");
    return;
  }

  const apiUrl = assertLocalApi(required(process.env.F16_LOAD_API_URL, "F16_LOAD_API_URL"));
  const outputFile = resolve(required(process.env.F16_LOAD_ENV_FILE, "F16_LOAD_ENV_FILE"));
  if (outputFile.startsWith(resolve(tmpdir())) === false) {
    throw new Error("F16_LOAD_ENV_FILE must be inside the operating-system temporary directory");
  }
  const env = parseEnv(await readFile(outputFile, "utf8"));
  const password = required(process.env.SEED_TEST_PASSWORD, "SEED_TEST_PASSWORD");

  for (let index = 1; index <= OPERATOR_COUNT; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const email = required(
      env.get(`PILOT_LOAD_OPERATOR_${suffix}`),
      `PILOT_LOAD_OPERATOR_${suffix}`,
    );
    const response = await fetch(new URL("/api/v1/auth/login", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok)
      throw new Error(`F16 login failed for operator ${suffix}: HTTP ${response.status}`);
    env.set(`PILOT_LOAD_SESSION_${suffix}`, getSessionCookie(response));
  }

  await writeFile(outputFile, `${[...env].map(([key, value]) => `${key}=${value}`).join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({ status: "ready", sessions: OPERATOR_COUNT, loadEnvironmentFile: outputFile }),
  );
}

await main();
