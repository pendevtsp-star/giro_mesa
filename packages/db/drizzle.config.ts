import { defineConfig } from "drizzle-kit";

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
