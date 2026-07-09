import { request } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://localhost:3002";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3333";

async function checkHttp(url) {
  try {
    const context = await request.newContext({ baseURL: url });
    const response = await context.get("/", { timeout: 2500 });
    await context.dispose();
    return { ok: response.ok(), status: response.status() };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkApi(url) {
  try {
    const context = await request.newContext({ baseURL: url });
    const response = await context.get("/health", { timeout: 2500 });
    const body = await response.text();
    await context.dispose();
    return { ok: response.ok(), status: response.status(), body };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const web = await checkHttp(webUrl);
const api = await checkApi(apiUrl);
const warnings = [];

if (webUrl.includes("localhost") && apiUrl.includes("127.0.0.1")) {
  warnings.push(
    "WEB_URL e API_URL usam hosts diferentes. Para cookies em dev, prefira manter um padrao consistente quando possivel.",
  );
}

const summary = {
  webUrl,
  apiUrl,
  web,
  api,
  warnings,
  suggestedCommands: {
    resetDemo: "pnpm demo:reset",
    apiDev: "pnpm --filter @giromesa/api dev",
    webDev: "pnpm --filter @giromesa/web dev -- --hostname localhost --port 3002",
    e2eDev: "pnpm test:e2e:dev",
  },
};

console.log(JSON.stringify(summary, null, 2));

if (!web.ok || !api.ok) {
  process.exitCode = 1;
}
