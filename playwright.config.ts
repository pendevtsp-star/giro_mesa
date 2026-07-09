import { defineConfig, devices } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://localhost:3004";
const webServerUrl = new URL(webUrl);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1"
      ? undefined
      : {
          command: `pnpm --filter @giromesa/web start --hostname ${webServerUrl.hostname} --port ${webServerUrl.port}`,
          url: webUrl,
          reuseExistingServer,
          timeout: 120_000,
        },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
  ],
});
