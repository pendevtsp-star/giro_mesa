import { describe, expect, it } from "vitest";
import { loadEnv } from "./index";

const strongSecret = "0123456789abcdef0123456789abcdef";

const productionEnv = {
  NODE_ENV: "production",
  APP_URL: "https://giromesa.com.br",
  PUBLIC_APP_URL: "https://giromesa.com.br",
  API_URL: "https://giromesa.com.br",
  DATABASE_URL: "postgres://giromesa:secret@db:5432/giromesa",
  REDIS_URL: "redis://redis:6379",
  SESSION_SECRET: strongSecret,
  PASSWORD_PEPPER: `${strongSecret}-pepper`,
  MFA_SECRET_ENCRYPTION_KEY: `${strongSecret}-mfa`,
} satisfies NodeJS.ProcessEnv;

describe("loadEnv production safety", () => {
  it("accepts local defaults outside production", () => {
    expect(loadEnv({ NODE_ENV: "development" }).SESSION_SECRET).toBe(
      "local-development-session-secret",
    );
  });

  it("rejects missing critical production values instead of silently applying defaults", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(
      /SESSION_SECRET: required in production/,
    );
  });

  it("rejects development and CI placeholders in production", () => {
    expect(() =>
      loadEnv({
        ...productionEnv,
        SESSION_SECRET: "local-development-session-secret",
        PASSWORD_PEPPER: "ci-password-pepper-change-in-production",
      }),
    ).toThrow(/development placeholder is not allowed in production/);
  });

  it("rejects short production secrets", () => {
    expect(() =>
      loadEnv({
        ...productionEnv,
        SESSION_SECRET: "sixteen-chars-key",
      }),
    ).toThrow(/SESSION_SECRET: must be at least 32 characters/);
  });

  it("accepts strong production configuration", () => {
    expect(loadEnv(productionEnv).NODE_ENV).toBe("production");
  });
});
