import { z } from "zod";

export * from "./safe-http-client";
export * from "./sensitive-data";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("GiroMesa"),
  APP_URL: z.url().default("http://localhost:3002"),
  PUBLIC_APP_URL: z.url().default("http://localhost:3002"),
  API_URL: z.url().default("http://localhost:3333"),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3333),
  DATABASE_URL: z.string().min(1).default("postgres://giromesa:giromesa@localhost:55432/giromesa"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(12),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(5_000),
  API_INSTANCE_ID: z.string().min(1).max(80).default("local-api"),
  REALTIME_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(30_000).default(1_000),
  REALTIME_BATCH_LIMIT: z.coerce.number().int().min(1).max(200).default(200),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  SESSION_SECRET: z.string().min(1).default("local-development-session-secret"),
  FEDERATION_ISSUER_URL: z.url().default("https://accounts.giromesa.com.br"),
  FEDERATION_HANDOFF_SECRET: z
    .string()
    .min(1)
    .default("local-development-federation-handoff-secret"),
  DOSECLUB_PUBLIC_URL: z.url().default("https://doseclube.giromesa.com.br"),
  DOSECLUB_SSO_EXCHANGE_KEY: z
    .string()
    .min(1)
    .default("local-development-doseclub-sso-exchange-key"),
  QR_SIGNING_SECRET: z.string().min(1).default("local-development-qr-signing-secret"),
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
  WHATSAPP_TRANSPORT: z.enum(["disabled", "qr_unofficial", "meta_legacy"]).default("disabled"),
  WHATSAPP_QR_CONNECTOR_URL: z.url().optional(),
  WHATSAPP_QR_CONNECTOR_KEY: z.string().optional(),
  IFOOD_WEBHOOK_MODE: z.enum(["disabled", "sandbox", "mock", "production"]).default("disabled"),
  IFOOD_MERCHANT_ID: z.string().optional(),
  IFOOD_API_KEY: z.string().optional(),
  IFOOD_WEBHOOK_SECRET: z.string().optional(),
  CLUB_WHISKY_WEBHOOK_SECRET: z.string().optional(),
  CLUB_WHISKY_API_BASE_URL: z.url().optional(),
  CLUB_WHISKY_API_KEY: z.string().optional(),
  FISCAL_PROVIDER: z.string().default("mock"),
  FISCAL_PRODUCTION_ENABLED: z.enum(["true", "false"]).default("false"),
  FISCAL_CREDENTIALS_ENCRYPTION_KEY: z.string().min(1).optional(),
  FISCAL_SIMULATOR_WEBHOOK_SECRET: z.string().min(16).optional(),
  FOCUS_NFE_PLATFORM_TOKEN: z.string().optional(),
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
  RESEND_API_KEY: z.string().optional(),
  RESEND_API_URL: z.url().default("https://api.resend.com"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  CSP_REPORT_ONLY: z.enum(["true", "false"]).default("false"),
  PILOT_INVITE_ONLY: z.enum(["true", "false"]).optional(),
  LEGAL_TERMS_VERSION: z.string().min(1).optional(),
  LEGAL_TERMS_SHA256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  LEGAL_PRIVACY_VERSION: z.string().min(1).optional(),
  LEGAL_PRIVACY_SHA256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  BACKUP_ENABLED: z.enum(["true", "false"]).default("true"),
  BACKUP_SCHEDULE: z.string().default("0 2 * * *"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  BACKUP_STORAGE_PATH: z.string().default("./backups"),
  BACKUP_VALIDATE_AFTER_CREATE: z.enum(["true", "false"]).default("false"),
  NOTIFY_BACKUP_WEBHOOK: z.url().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

const requiredProductionKeys = [
  "SESSION_SECRET",
  "QR_SIGNING_SECRET",
  "PASSWORD_PEPPER",
  "MFA_SECRET_ENCRYPTION_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "APP_URL",
  "PUBLIC_APP_URL",
  "API_URL",
  "EMAIL_PROVIDER",
  "LEGAL_TERMS_VERSION",
  "LEGAL_TERMS_SHA256",
  "LEGAL_PRIVACY_VERSION",
  "LEGAL_PRIVACY_SHA256",
] as const;

const secretProductionKeys = [
  "SESSION_SECRET",
  "QR_SIGNING_SECRET",
  "PASSWORD_PEPPER",
  "MFA_SECRET_ENCRYPTION_KEY",
] as const;

const weakProductionValues = new Set([
  "local-development-session-secret",
  "local-development-federation-handoff-secret",
  "local-development-doseclub-sso-exchange-key",
  "local-development-qr-signing-secret",
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
    if (typeof parsedValue !== "string" || parsedValue.trim().length === 0) {
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

  if (env.FISCAL_PRODUCTION_ENABLED === "true" && !rawInput.FISCAL_CREDENTIALS_ENCRYPTION_KEY) {
    errors.push("FISCAL_CREDENTIALS_ENCRYPTION_KEY: required when fiscal production is enabled");
  }

  for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
    try {
      new URL(env[key]);
    } catch {
      errors.push(`${key}: must be a valid URL in production`);
    }
  }

  if (env.EMAIL_PROVIDER === "resend") {
    if (!rawInput.RESEND_API_KEY?.trim()) {
      errors.push("RESEND_API_KEY: required when EMAIL_PROVIDER=resend");
    }
    if (!rawInput.EMAIL_FROM?.trim()) {
      errors.push("EMAIL_FROM: required when EMAIL_PROVIDER=resend");
    }
  } else if (env.EMAIL_PROVIDER === "smtp") {
    for (const key of ["EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
      if (!rawInput[key]?.trim()) {
        errors.push(`${key}: required when EMAIL_PROVIDER=smtp`);
      }
    }
    const smtpHost = rawInput.SMTP_HOST?.trim();
    if (
      !smtpHost ||
      smtpHost === "smtp.example.com" ||
      smtpHost.endsWith(".example.com") ||
      smtpHost.endsWith(".invalid") ||
      smtpHost.endsWith(".test")
    ) {
      errors.push("SMTP_HOST: placeholder is not allowed when EMAIL_PROVIDER=smtp");
    }
  } else {
    errors.push("EMAIL_PROVIDER: production requires resend or smtp");
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
  backup: "backup-events",
} as const;
