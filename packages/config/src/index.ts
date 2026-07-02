import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("GiroMesa"),
  APP_URL: z.url().default("http://localhost:3000"),
  API_URL: z.url().default("http://localhost:3333"),
  DATABASE_URL: z.string().min(1).default("postgres://giromesa:giromesa@localhost:55432/giromesa"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  SESSION_SECRET: z.string().min(16).default("local-development-session-secret"),
  PASSWORD_PEPPER: z.string().min(16).default("local-development-password-pepper"),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_SECRET: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  FISCAL_PROVIDER: z.string().default("mock"),
  FISCAL_API_BASE_URL: z.string().optional(),
  FISCAL_API_KEY: z.string().optional(),
  EMAIL_PROVIDER: z.string().default("smtp"),
  EMAIL_FROM: z.email().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${errors}`);
  }

  return parsed.data;
}

export const queueNames = {
  audit: "audit-events",
  asaasWebhook: "asaas-webhooks",
  fiscal: "fiscal-documents",
  inventory: "inventory-movements",
  messaging: "messaging-events",
  outbox: "outbox-events",
} as const;
