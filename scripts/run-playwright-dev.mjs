import { spawn } from "node:child_process";

const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "playwright", "test"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_WEB_SERVER: "1",
      WEB_URL: process.env.WEB_URL ?? "http://localhost:3002",
      API_URL: process.env.API_URL ?? "http://127.0.0.1:3333",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
