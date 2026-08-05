#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_DURATION_SECONDS = 90 * 60;
const DEFAULT_VUS = 12;
const DEFAULT_TIMEOUT_MS = 10_000;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function numberFromEnv(name, fallback, min = 1) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be a number >= ${min}`);
  }
  return value;
}

function expandTemplate(value, context) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
    if (token.startsWith("env:")) {
      const name = token.slice(4);
      return context.env?.[name] ?? process.env[name] ?? "";
    }
    return String(context[token] ?? "");
  });
}

function expandJson(value, context) {
  if (typeof value === "string") return expandTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => expandJson(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expandJson(item, context)]),
    );
  }
  return value;
}

function getPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => current?.[key], value);
}

function collectTemplates(value) {
  if (typeof value === "string") return value.match(/\{\{[^}]+\}\}/g) ?? [];
  if (Array.isArray(value)) return value.flatMap(collectTemplates);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectTemplates);
  return [];
}

function evaluateResponseContract(step, responseBody, context) {
  const matches = Object.entries(step.assertResponse ?? {}).every(
    ([path, expected]) => getPath(responseBody, path) === expandTemplate(expected, context),
  );
  const captured = Object.fromEntries(
    Object.entries(step.capture ?? {}).map(([name, path]) => [name, getPath(responseBody, path)]),
  );
  const captureComplete = Object.values(captured).every(
    (value) => value !== undefined && value !== null,
  );
  return { captured, valid: matches && captureComplete };
}

function expectFailure(callback, message) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil((values.length - 1) * p));
  return values[index];
}

function pickStep(steps, random = Math.random) {
  const totalWeight = steps.reduce((sum, step) => sum + (step.weight ?? 1), 0);
  let cursor = random() * totalWeight;
  for (const step of steps) {
    cursor -= step.weight ?? 1;
    if (cursor <= 0) return step;
  }
  return steps.at(-1);
}

function assertScenario(scenario) {
  if (!scenario || typeof scenario !== "object") throw new Error("Scenario must be an object");
  const baseUrl = required(scenario.baseUrl, "scenario.baseUrl");
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("scenario.baseUrl must use HTTP or HTTPS");
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error("scenario.steps must contain at least one request");
  }
  const requiredOperators = Number(scenario.requirements?.operators ?? 0);
  if (requiredOperators > 0 && scenario.identities?.length !== requiredOperators) {
    throw new Error(`scenario must define exactly ${requiredOperators} operator identities`);
  }
  if (scenario.identities) {
    const names = scenario.identities.map((identity) => required(identity.name, "identity.name"));
    if (new Set(names).size !== names.length) throw new Error("Operator names must be unique");
  }
  for (const step of [
    ...(scenario.setupSteps ?? []),
    ...scenario.steps,
    ...(scenario.teardownSteps ?? []),
  ]) {
    if (!step.name || !step.path) throw new Error("Every scenario step needs name and path");
    if (!String(step.path).startsWith("/")) throw new Error(`${step.name}: path must start with /`);
  }

  const capturedVariables = new Set(
    (scenario.setupSteps ?? []).flatMap((step) => Object.keys(step.capture ?? {})),
  );
  const runtimeTemplates = collectTemplates([scenario.steps, scenario.teardownSteps ?? []]).map(
    (template) => template.slice(2, -2),
  );
  for (const variable of capturedVariables) {
    if (!runtimeTemplates.includes(variable)) {
      throw new Error(`Captured variable ${variable} is not used after setup`);
    }
  }
}

function prepareExecution(scenario, virtualUsers, env = process.env) {
  const operators = Number(scenario.requirements?.operators ?? scenario.identities?.length ?? 1);
  const minimumTargets = Number(scenario.requirements?.minimumTargets ?? 0);
  if (virtualUsers !== operators) {
    throw new Error(`PILOT_LOAD_VUS must be ${operators} for this scenario`);
  }

  for (const name of scenario.requiredEnv ?? []) required(env[name], name);

  const identities = (scenario.identities ?? [{ name: "default" }]).map((identity) => ({
    ...identity,
    runtimeVariables: expandJson(identity.variables ?? {}, {}),
    targets: [],
  }));
  const sessions = identities.map((identity) =>
    expandTemplate(identity.headers?.cookie ?? "", { env }),
  );
  if (sessions.some((session) => !session))
    throw new Error("Every operator needs a session cookie");
  if (new Set(sessions).size !== sessions.length) {
    throw new Error("Operator session cookies must be unique");
  }

  const pool = required(scenario.targetPool, "scenario.targetPool");
  const count = Number(pool.count ?? 0);
  if (!Number.isInteger(count) || count < minimumTargets) {
    throw new Error(`scenario.targetPool.count must be an integer >= ${minimumTargets}`);
  }
  if (count % identities.length !== 0) {
    throw new Error("Target pool must be evenly distributed across operator identities");
  }
  const prefix = required(pool.tableIdEnvPrefix, "scenario.targetPool.tableIdEnvPrefix");
  const padWidth = Number(pool.padWidth ?? 3);
  const targets = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(padWidth, "0");
    const tableEnvName = `${prefix}${suffix}`;
    const target = {
      name: `table-${suffix}`,
      variables: {
        targetNumber: number,
        targetName: `table-${suffix}`,
        tableId: required(env[tableEnvName], tableEnvName),
      },
    };
    identities[index % identities.length].targets.push(target);
    return target;
  });
  const tableIds = targets.map((target) => target.variables.tableId);
  if (new Set(tableIds).size !== tableIds.length)
    throw new Error("Target table IDs must be unique");

  const captureStep = (scenario.setupSteps ?? []).find(
    (step) => step.forEachTarget && step.capture?.orderId,
  );
  if (!captureStep) {
    throw new Error("Setup must capture orderId once for every target");
  }
  if (captureStep.assertResponse?.tableId !== "{{tableId}}") {
    throw new Error("Setup must assert that the returned order belongs to the target table");
  }

  return { identities, targets };
}

async function hydrateIdentityCsrf(scenario, identities, timeoutMs) {
  await Promise.all(
    identities.map(async (identity) => {
      const cookie = expandTemplate(identity.headers?.cookie ?? "", { env: process.env });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL("/api/v1/auth/csrf", scenario.baseUrl), {
          headers: { accept: "application/json", cookie },
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`CSRF bootstrap failed for ${identity.name}: HTTP ${response.status}`);
        const payload = await response.json();
        if (typeof payload.csrfToken !== "string" || !payload.csrfToken) {
          throw new Error(`CSRF bootstrap returned no token for ${identity.name}`);
        }
        identity.runtimeVariables.csrfToken = payload.csrfToken;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
}

function prepareSseExecution(scenario, env = process.env) {
  const configured = scenario.sse;
  if (!configured) return null;
  if (!configured.path || !String(configured.path).startsWith("/")) {
    throw new Error("scenario.sse.path must start with /");
  }
  const consumers = numberFromEnv("PILOT_LOAD_SSE_CONSUMERS", Number(configured.consumers ?? 600));
  const reconnectEveryMs = numberFromEnv(
    "PILOT_LOAD_SSE_RECONNECT_MS",
    Number(configured.reconnectEveryMs ?? 30_000),
    250,
  );
  const minConnected = Number(
    process.env.PILOT_LOAD_SSE_MIN_CONNECTED ?? configured.minConnected ?? consumers,
  );
  const maxFailures = Number(
    process.env.PILOT_LOAD_SSE_MAX_FAILURES ?? configured.maxFailures ?? 0,
  );
  if (!Number.isInteger(minConnected) || minConnected < 1 || minConnected > consumers) {
    throw new Error("PILOT_LOAD_SSE_MIN_CONNECTED must be an integer between 1 and consumers");
  }
  if (!Number.isInteger(maxFailures) || maxFailures < 0) {
    throw new Error("PILOT_LOAD_SSE_MAX_FAILURES must be a non-negative integer");
  }
  const templates = collectTemplates([configured.path, configured.headers ?? {}]);
  for (const template of templates) {
    if (template.includes("env:") && !expandTemplate(template, { env })) {
      throw new Error(`SSE template ${template} resolved to an empty value`);
    }
  }
  return {
    consumers,
    reconnectEveryMs,
    minConnected,
    maxFailures,
    path: configured.path,
    headers: configured.headers ?? {},
  };
}

function sseClientIp(index) {
  const zeroBased = index - 1;
  return `10.200.${Math.floor(zeroBased / 250)}.${(zeroBased % 250) + 1}`;
}

function shouldCountSseFailure(error, { connected, stopped, signal }) {
  if (stopped || (connected && signal.aborted)) return false;
  return !(error instanceof Error && error.name === "AbortError");
}

function consumeSseStream(body, controller, reconnectEveryMs, metrics) {
  if (!body) return Promise.reject(new Error("SSE response body is missing"));
  return (async () => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let remainder = "";
    const reconnectTimer = setTimeout(() => controller.abort(), reconnectEveryMs);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        remainder += decoder.decode(value, { stream: true });
        let boundary = remainder.indexOf("\n\n");
        while (boundary >= 0) {
          metrics.events += 1;
          remainder = remainder.slice(boundary + 2);
          boundary = remainder.indexOf("\n\n");
        }
      }
    } finally {
      clearTimeout(reconnectTimer);
      await reader.cancel().catch(() => undefined);
    }
  })();
}

async function startSseConsumers(scenario, options) {
  const config = prepareSseExecution(scenario);
  if (!config) return null;
  const metrics = {
    configured: config.consumers,
    connections: 0,
    active: 0,
    maxConcurrent: 0,
    reconnections: 0,
    events: 0,
    failures: 0,
    statusCounts: {},
  };
  let stopped = false;
  const controllers = new Set();
  const initial = Array.from({ length: config.consumers }, () => ({ resolve: null }));
  const initialSettled = initial.map(
    (entry) =>
      new Promise((resolveInitial) => {
        entry.resolve = resolveInitial;
      }),
  );
  const deadline = Date.now() + options.durationSeconds * 1000;

  const workers = Array.from({ length: config.consumers }, async (_, index) => {
    const client = index + 1;
    let firstAttempt = true;
    while (!stopped && Date.now() < deadline) {
      let active = false;
      let connected = false;
      const controller = new AbortController();
      controllers.add(controller);
      const connectTimeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const guestKey = `PILOT_LOAD_QR_GUEST_${String(client).padStart(3, "0")}`;
        const context = {
          env: process.env,
          sseClient: client,
          sseIp: sseClientIp(client),
          sseGuest: required(process.env[guestKey], guestKey),
        };
        const response = await fetch(
          new URL(expandTemplate(config.path, context), scenario.baseUrl),
          {
            headers: expandJson(config.headers, context),
            signal: controller.signal,
          },
        );
        clearTimeout(connectTimeout);
        metrics.statusCounts[response.status] = (metrics.statusCounts[response.status] ?? 0) + 1;
        if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
          metrics.failures += 1;
          if (firstAttempt) initial[index].resolve(false);
          break;
        }
        metrics.connections += 1;
        metrics.active += 1;
        connected = true;
        active = true;
        metrics.maxConcurrent = Math.max(metrics.maxConcurrent, metrics.active);
        if (firstAttempt) initial[index].resolve(true);
        firstAttempt = false;
        await consumeSseStream(response.body, controller, config.reconnectEveryMs, metrics);
        if (!stopped && Date.now() < deadline) metrics.reconnections += 1;
      } catch (error) {
        if (connected && !stopped && Date.now() < deadline) {
          metrics.reconnections += 1;
        }
        if (shouldCountSseFailure(error, { connected, stopped, signal: controller.signal })) {
          metrics.failures += 1;
        }
        if (firstAttempt) initial[index].resolve(false);
        firstAttempt = false;
      } finally {
        clearTimeout(connectTimeout);
        controllers.delete(controller);
        if (active) metrics.active -= 1;
      }
      if (!stopped && Date.now() < deadline)
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
    if (firstAttempt) initial[index].resolve(false);
  });

  const initiallyConnected = (await Promise.all(initialSettled)).filter(Boolean).length;
  return {
    async stop() {
      stopped = true;
      for (const controller of controllers) controller.abort();
      await Promise.allSettled(workers);
      const passed =
        initiallyConnected >= config.minConnected &&
        metrics.maxConcurrent >= config.minConnected &&
        metrics.failures <= config.maxFailures;
      return {
        ...metrics,
        initiallyConnected,
        limits: { minConnected: config.minConnected, maxFailures: config.maxFailures },
        passed,
      };
    },
  };
}

async function loadScenario(path) {
  const source = await readFile(path instanceof URL ? path : resolve(path), "utf8");
  const scenario = JSON.parse(source.replace(/^\uFEFF/, ""));
  assertScenario(scenario);
  return scenario;
}

async function hydrateRuntimeEnvFile(path) {
  if (!path) return;
  const source = await readFile(resolve(path), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

async function executeRequest({ scenario, step, identity, target, worker, sequence, timeoutMs }) {
  const idempotencyKey = randomUUID();
  const baseContext = {
    worker,
    sequence,
    idempotencyKey,
    timestamp: new Date().toISOString(),
    identity: identity?.name ?? `worker-${worker}`,
  };
  const context = {
    ...baseContext,
    ...expandJson(identity?.runtimeVariables ?? identity?.variables ?? {}, baseContext),
    ...expandJson(target?.variables ?? {}, baseContext),
  };
  const headers = {
    accept: "application/json",
    ...expandJson(scenario.headers ?? {}, context),
    ...expandJson(identity?.headers ?? {}, context),
    ...expandJson(step.headers ?? {}, context),
  };
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes((step.method ?? "GET").toUpperCase());
  if (unsafeMethod && identity?.runtimeVariables?.csrfToken && !headers["x-csrf-token"]) {
    headers["x-csrf-token"] = identity.runtimeVariables.csrfToken;
  }
  const body = step.body === undefined ? undefined : JSON.stringify(expandJson(step.body, context));
  if (body && !headers["content-type"]) headers["content-type"] = "application/json";
  if (step.idempotent !== false && body && !headers["x-idempotency-key"]) {
    headers["x-idempotency-key"] = idempotencyKey;
  }

  const attempts = Math.max(1, Number(step.maxAttempts ?? 2));
  let lastResult;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(new URL(expandTemplate(step.path, context), scenario.baseUrl), {
        method: step.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
      });
      const durationMs = performance.now() - startedAt;
      const expectedStatuses = step.expectedStatuses ?? [200, 201, 202, 204];
      let responseBody;
      if (step.capture || step.assertResponse) {
        const responseText = await response.text();
        try {
          responseBody = responseText ? JSON.parse(responseText) : undefined;
        } catch {
          responseBody = undefined;
        }
      }
      let ok = expectedStatuses.includes(response.status);
      const contract = evaluateResponseContract(step, responseBody, context);
      if (ok) ok = contract.valid;
      lastResult = {
        ok,
        status:
          ok || !expectedStatuses.includes(response.status) ? response.status : "assertion_failed",
        durationMs,
        attempt,
        step: step.name,
        captured: contract.captured,
      };
      if (ok || response.status < 500) return lastResult;
    } catch (error) {
      lastResult = {
        ok: false,
        status: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
        durationMs: performance.now() - startedAt,
        attempt,
        step: step.name,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return lastResult;
}

async function runScenario(scenario, options) {
  const startedAt = Date.now();
  const results = [];
  let sequence = 0;
  const deadline = startedAt + options.durationSeconds * 1000;
  const { identities } = prepareExecution(scenario, options.virtualUsers);
  await hydrateIdentityCsrf(scenario, identities, options.timeoutMs);
  const sseControl = await startSseConsumers(scenario, options);
  let sseReport = null;

  try {
    await Promise.all(
      Array.from({ length: options.virtualUsers }, async (_, index) => {
        const identity = identities[index % identities.length];
        let targetCursor = 0;
        const execute = async (step, selectedTarget) => {
          if (Array.isArray(step.workers) && !step.workers.includes(index + 1)) return;
          const target =
            selectedTarget ?? identity.targets[targetCursor++ % identity.targets.length];
          const enabled = expandTemplate(step.enabledWhen ?? "true", {
            worker: index + 1,
            identity: identity?.name ?? `worker-${index + 1}`,
            ...expandJson(identity?.runtimeVariables ?? {}, { worker: index + 1 }),
            ...expandJson(target?.variables ?? {}, { worker: index + 1 }),
          });
          if (["", "0", "false", "no"].includes(String(enabled).toLowerCase())) return;
          const result = await executeRequest({
            scenario,
            step,
            identity,
            target,
            worker: index + 1,
            sequence: ++sequence,
            timeoutMs: options.timeoutMs,
          });
          results.push({ ...result, captured: undefined });
          if (result.ok && target && Object.keys(result.captured ?? {}).length > 0) {
            Object.assign(target.variables, result.captured);
          }
          return result;
        };
        for (const step of scenario.setupSteps ?? []) {
          if (step.forEachTarget) {
            for (const target of identity.targets) {
              const result = await execute(step, target);
              if (!result?.ok) throw new Error(`${step.name} failed for ${target.name}`);
            }
          } else {
            await execute(step);
          }
        }
        for (const target of identity.targets) {
          if (!target.variables.orderId)
            throw new Error(`Setup did not capture orderId for ${target.name}`);
        }
        while (Date.now() < deadline) {
          const step = pickStep(scenario.steps);
          await execute(step);
          if (options.thinkMs > 0)
            await new Promise((resolveDelay) => setTimeout(resolveDelay, options.thinkMs));
        }
        for (const step of scenario.teardownSteps ?? []) {
          if (step.forEachTarget) {
            for (const target of identity.targets) await execute(step, target);
          } else {
            await execute(step);
          }
        }
      }),
    );
  } finally {
    sseReport = await sseControl?.stop();
  }

  const sortedDurations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  const byStep = Object.groupBy(results, (result) => result.step);
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    config: options,
    sse: sseReport,
    requests: results.length,
    failures: failures.length,
    errorRate: results.length === 0 ? 1 : failures.length / results.length,
    latencyMs: {
      p50: Math.round(percentile(sortedDurations, 0.5)),
      p95: Math.round(percentile(sortedDurations, 0.95)),
      p99: Math.round(percentile(sortedDurations, 0.99)),
      max: Math.round(sortedDurations.at(-1) ?? 0),
    },
    statusCounts: Object.fromEntries(
      Object.entries(Object.groupBy(results, (result) => String(result.status))).map(
        ([status, matches]) => [status, matches.length],
      ),
    ),
    steps: Object.fromEntries(
      Object.entries(byStep).map(([name, stepResults]) => [
        name,
        {
          requests: stepResults.length,
          failures: stepResults.filter((result) => !result.ok).length,
          p95Ms: Math.round(
            percentile(
              stepResults.map((result) => result.durationMs).sort((a, b) => a - b),
              0.95,
            ),
          ),
        },
      ]),
    ),
  };
  return report;
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const scenario = await loadScenario(
      new URL("./pilot-load-scenario.example.json", import.meta.url),
    );
    const env = {
      PILOT_LOAD_BRANCH_ID: "branch-test",
      PILOT_LOAD_PRODUCT_ID: "product-test",
      PILOT_LOAD_STATION_ID: "station-test",
      PILOT_LOAD_QR_TOKEN: "qr-token-test",
      PILOT_LOAD_QR_GUEST: "qr-guest-test",
    };
    for (let operator = 1; operator <= 12; operator += 1) {
      env[`PILOT_LOAD_SESSION_${String(operator).padStart(2, "0")}`] = `session-${operator}`;
    }
    for (let target = 1; target <= 120; target += 1) {
      env[`PILOT_LOAD_TABLE_${String(target).padStart(3, "0")}`] = `table-${target}`;
    }
    const execution = prepareExecution(scenario, 12, env);
    const sse = prepareSseExecution(scenario, env);
    if (execution.targets.length !== 120) throw new Error("Target coverage self-check failed");
    if (execution.identities.some((identity) => identity.targets.length !== 10)) {
      throw new Error("Operator distribution self-check failed");
    }
    execution.identities[0].runtimeVariables.csrfToken = "csrf-test";
    if (sse?.consumers !== 600 || sse.minConnected !== 600 || sseClientIp(600) !== "10.200.2.100") {
      throw new Error("SSE capacity self-check failed");
    }
    const intentionalReconnect = new AbortController();
    intentionalReconnect.abort();
    if (
      shouldCountSseFailure(new TypeError("terminated"), {
        connected: true,
        stopped: false,
        signal: intentionalReconnect.signal,
      }) ||
      !shouldCountSseFailure(new TypeError("terminated"), {
        connected: true,
        stopped: false,
        signal: new AbortController().signal,
      })
    ) {
      throw new Error("SSE failure classification self-check failed");
    }
    const setup = scenario.setupSteps[0];
    const target = execution.targets[0];
    const response = { id: "order-1", tableId: target.variables.tableId };
    const contract = evaluateResponseContract(setup, response, target.variables);
    if (!contract.valid) throw new Error("Setup capture/coherence self-check failed");
    Object.assign(target.variables, contract.captured);
    if (expandTemplate("/orders/{{orderId}}", target.variables) !== "/orders/order-1") {
      throw new Error("Captured orderId chaining self-check failed");
    }
    expectFailure(
      () =>
        prepareExecution(
          { ...scenario, targetPool: { ...scenario.targetPool, count: 119 } },
          12,
          env,
        ),
      "Minimum target coverage self-check failed",
    );
    expectFailure(
      () => prepareExecution(scenario, 12, { ...env, PILOT_LOAD_TABLE_120: "table-1" }),
      "Target uniqueness self-check failed",
    );
    expectFailure(
      () =>
        prepareExecution(
          {
            ...scenario,
            setupSteps: [{ ...setup, assertResponse: { tableId: "wrong" } }],
          },
          12,
          env,
        ),
      "Table-order coherence self-check failed",
    );
    if (expandTemplate("{{env:NOT_DEFINED}}-{{worker}}", { worker: 2 }) !== "-2") {
      throw new Error("Template expansion failed");
    }
    if (pickStep([{ name: "one", weight: 1 }], () => 0)?.name !== "one") {
      throw new Error("Step selection failed");
    }
    console.log("pilot-load-test self-check passed");
    return;
  }

  await hydrateRuntimeEnvFile(process.env.PILOT_LOAD_ENV_FILE);
  const scenarioPath = required(process.env.PILOT_LOAD_SCENARIO, "PILOT_LOAD_SCENARIO");
  const scenario = await loadScenario(scenarioPath);
  const options = {
    durationSeconds: numberFromEnv("PILOT_LOAD_DURATION_SECONDS", DEFAULT_DURATION_SECONDS),
    virtualUsers: numberFromEnv("PILOT_LOAD_VUS", DEFAULT_VUS),
    timeoutMs: numberFromEnv("PILOT_LOAD_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    thinkMs: numberFromEnv("PILOT_LOAD_THINK_MS", 150, 0),
  };
  const report = await runScenario(scenario, options);
  const reportPath = process.env.PILOT_LOAD_REPORT ?? "artifacts/pilot-load-report.json";
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));

  const maxErrorRate = Number(process.env.PILOT_LOAD_MAX_ERROR_RATE ?? "0.01");
  const maxP95Ms = Number(process.env.PILOT_LOAD_MAX_P95_MS ?? "500");
  if (
    report.errorRate > maxErrorRate ||
    report.latencyMs.p95 > maxP95Ms ||
    report.sse?.passed === false
  ) {
    throw new Error(`Pilot load gate failed; inspect ${reportPath}`);
  }
}

await main();
