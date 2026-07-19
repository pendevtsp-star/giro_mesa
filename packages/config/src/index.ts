import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("GiroMesa"),
  APP_URL: z.url().default("http://localhost:3002"),
  PUBLIC_APP_URL: z.url().default("http://localhost:3002"),
  API_URL: z.url().default("http://localhost:3333"),
  DATABASE_URL: z.string().min(1).default("postgres://giromesa:giromesa@localhost:55432/giromesa"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  SESSION_SECRET: z.string().min(1).default("local-development-session-secret"),
  PASSWORD_PEPPER: z.string().min(1).default("local-development-password-pepper"),
  MFA_ISSUER: z.string().default("GiroMesa"),
  MFA_SECRET_ENCRYPTION_KEY: z.string().min(1).default("local-development-mfa-secret-key"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ASAAS_SANDBOX_URL: z.url().default("https://api-sandbox.asaas.com/v3"),
  ASAAS_PRODUCTION_URL: z.url().default("https://api.asaas.com/v3"),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_SECRET: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  IFOOD_WEBHOOK_MODE: z.enum(["disabled", "sandbox", "mock", "production"]).default("disabled"),
  CLUB_WHISKY_WEBHOOK_SECRET: z.string().optional(),
  CLUB_WHISKY_API_BASE_URL: z.url().optional(),
  CLUB_WHISKY_API_KEY: z.string().optional(),
  FISCAL_PROVIDER: z.string().default("mock"),
  FISCAL_API_BASE_URL: z.string().optional(),
  FISCAL_API_KEY: z.string().optional(),
  FISCAL_CERTIFICATE_A1: z.string().optional(),
  FISCAL_CSC_TOKEN: z.string().optional(),
  NUVEM_FISCAL_CLIENT_ID: z.string().optional(),
  NUVEM_FISCAL_CLIENT_SECRET: z.string().optional(),
  NUVEM_FISCAL_AUTH_URL: z.url().default("https://auth.nuvemfiscal.com.br/oauth/token"),
  NUVEM_FISCAL_SANDBOX_URL: z.url().default("https://api.sandbox.nuvemfiscal.com.br"),
  NUVEM_FISCAL_PRODUCTION_URL: z.url().default("https://api.nuvemfiscal.com.br"),
  NUVEM_FISCAL_SCOPE: z.string().default("empresa nfce nfe nfse"),
  FOCUS_NFE_TOKEN: z.string().optional(),
  FOCUS_NFE_HOMOLOGATION_URL: z.url().default("https://homologacao.focusnfe.com.br"),
  FOCUS_NFE_PRODUCTION_URL: z.url().default("https://api.focusnfe.com.br"),
  EMAIL_PROVIDER: z.string().default("smtp"),
  EMAIL_FROM: z.email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

const requiredProductionKeys = [
  "SESSION_SECRET",
  "PASSWORD_PEPPER",
  "MFA_SECRET_ENCRYPTION_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "APP_URL",
  "PUBLIC_APP_URL",
  "API_URL",
] as const;

const secretProductionKeys = [
  "SESSION_SECRET",
  "PASSWORD_PEPPER",
  "MFA_SECRET_ENCRYPTION_KEY",
] as const;

const weakProductionValues = new Set([
  "local-development-session-secret",
  "local-development-password-pepper",
  "local-development-mfa-secret-key",
]);

function isPlaceholderValue(value: string) {
  return (
    value.startsWith("replace-with-") ||
    /^ci-.+change-in-production$/i.test(value) ||
    weakProductionValues.has(value)
  );
}

function validateProductionEnv(rawInput: NodeJS.ProcessEnv, env: AppEnv) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const errors: string[] = [];

  for (const key of requiredProductionKeys) {
    const rawValue = rawInput[key];
    const parsedValue = env[key];
    if (!rawValue || rawValue.trim().length === 0) {
      errors.push(`${key}: required in production`);
      continue;
    }
    if (isPlaceholderValue(parsedValue)) {
      errors.push(`${key}: development placeholder is not allowed in production`);
    }
  }

  for (const key of secretProductionKeys) {
    const value = env[key];
    if (value.length < 32) {
      errors.push(`${key}: must be at least 32 characters in production`);
    }
  }

  for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
    try {
      new URL(env[key]);
    } catch {
      errors.push(`${key}: must be a valid URL in production`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production environment: ${errors.join("; ")}`);
  }
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${errors}`);
  }

  validateProductionEnv(input, parsed.data);

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
