import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
  } catch {
    // CI and production provide DATABASE_URL directly.
  }
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa",
  },
  verbose: true,
  strict: true,
});
