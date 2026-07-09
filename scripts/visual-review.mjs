import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, request } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://localhost:3002";
const apiUrl = process.env.API_URL ?? "http://localhost:3333";
const outputDir = resolve("test-results/visual-review");

await mkdir(outputDir, { recursive: true });

const api = await request.newContext({ baseURL: apiUrl });
const login = await api.post("/api/v1/auth/login", {
  data: {
    email: "admin@bar-aurora-demo.local",
    password: "Demo@12345",
  },
});

if (!login.ok()) {
  throw new Error(`Demo login failed with ${login.status()}`);
}

const sessionToken = login.headers()["set-cookie"]?.match(/gm_session=([^;]+)/)?.[1];
if (!sessionToken) {
  throw new Error("Demo login did not return gm_session cookie");
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: webUrl,
  viewport: { width: 1440, height: 1000 },
});

const cookieTargets = Array.from(new Set([new URL(webUrl).origin, new URL(apiUrl).origin]));
await context.addCookies(
  cookieTargets.map((url) => ({
    name: "gm_session",
    value: sessionToken,
    url,
    httpOnly: true,
    sameSite: "Lax",
  })),
);

const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => {
  consoleErrors.push(error.message);
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    failedRequests.push({ status: response.status(), url: response.url() });
  }
});

const pages = [
  ["landing", "/"],
  ["login", "/login"],
  ["app-dashboard", "/app"],
  ["team", "/app/team"],
  ["security", "/app/security"],
  ["public-menu", "/m/bar-aurora-demo"],
  ["table-qr", "/q/M03"],
];

const results = [];
for (const [name, path] of pages) {
  await page.goto(path, { waitUntil: "networkidle" });
  const file = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const title = await page.title();
  const mainHeading = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => null);
  results.push({
    name,
    path,
    url: page.url(),
    title,
    mainHeading,
    screenshot: file,
  });
}

await browser.close();
await api.dispose();

console.log(JSON.stringify({ outputDir, results, consoleErrors, failedRequests }, null, 2));
