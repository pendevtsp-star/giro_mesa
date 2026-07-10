import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "docs/SECURITY.md",
  "docs/legal/PRIVACY_POLICY.md",
  "docs/legal/TERMS_OF_USE.md",
  "apps/api/src/common/security.ts",
  "apps/api/src/common/webhook-signature.ts",
  "apps/api/src/modules/integrations/webhooks.controller.ts",
  "apps/api/src/common/http.ts",
  "apps/api/src/main.ts",
];

const requiredEnvKeys = [
  "APP_URL",
  "PUBLIC_APP_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "SESSION_SECRET",
  "PASSWORD_PEPPER",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "ASAAS_WEBHOOK_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "CLUB_WHISKY_WEBHOOK_SECRET",
];

const sensitiveKeyPatterns = [
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /API_KEY/i,
  /CLIENT_SECRET/i,
  /DSN/i,
];

const envExample = await readFile(".env.example", "utf8");
const envWarnings = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const [key, ...rest] = line.split("=");
    return { key, value: rest.join("=").trim() };
  })
  .filter(({ key }) => sensitiveKeyPatterns.some((pattern) => pattern.test(key)))
  .filter(({ value }) => {
    if (!value) {
      return false;
    }

    const normalized = value.toLowerCase();
    return !(
      normalized.startsWith("replace-with-") ||
      normalized.includes("example.com") ||
      normalized.includes("localhost") ||
      normalized.includes("sandbox.example.com") ||
      normalized === "false" ||
      normalized === "true"
    );
  })
  .map(({ key, value }) => `${key}=${value}`);

const fileChecks = await Promise.all(
  requiredFiles.map(async (file) => {
    try {
      await access(file);
      return { file, exists: true };
    } catch {
      return { file, exists: false };
    }
  }),
);

const missing = fileChecks.filter((entry) => !entry.exists).map((entry) => entry.file);
const mainTs = await readFile("apps/api/src/main.ts", "utf8");
const httpTs = await readFile("apps/api/src/common/http.ts", "utf8");
const webhookControllerTs = await readFile(
  "apps/api/src/modules/integrations/webhooks.controller.ts",
  "utf8",
);
const environment = readSimpleEnv(envExample);
const appUrl = environment.APP_URL ?? "";
const publicAppUrl = environment.PUBLIC_APP_URL ?? "";
const apiUrl = environment.API_URL ?? "";
const nextPublicApiUrl = environment.NEXT_PUBLIC_API_URL ?? "";
const googleRedirectUri = environment.GOOGLE_OAUTH_REDIRECT_URI ?? "";
const nodeEnv = environment.NODE_ENV ?? "development";
const missingEnvKeys = requiredEnvKeys.filter((key) => !(key in environment));
const localhostHosts = [appUrl, publicAppUrl, apiUrl, nextPublicApiUrl, googleRedirectUri]
  .filter(Boolean)
  .map(readHost);

const checks = {
  headers: {
    xContentTypeOptions: mainTs.includes('"x-content-type-options"'),
    xFrameOptions: mainTs.includes('"x-frame-options"'),
    contentSecurityPolicy: mainTs.includes('"content-security-policy"'),
    referrerPolicy: mainTs.includes('"referrer-policy"'),
    permissionsPolicy: mainTs.includes('"permissions-policy"'),
    crossOriginOpenerPolicy: mainTs.includes('"cross-origin-opener-policy"'),
    corsRestrictedInProduction: mainTs.includes(
      'origin: env.NODE_ENV === "production" ? [env.APP_URL] : true',
    ),
  },
  cookies: {
    httpOnly: httpTs.includes("HttpOnly"),
    sameSite: httpTs.includes("SameSite=Lax"),
    secureInProduction: httpTs.includes('process.env.NODE_ENV === "production" ? " Secure;" : ""'),
    pathRoot: httpTs.includes("Path=/"),
  },
  webhooks: {
    asaasSecretGuard: webhookControllerTs.includes("Invalid Asaas webhook secret"),
    clubSecretRequired: webhookControllerTs.includes(
      "Club Whisky webhook secret is not configured",
    ),
    clubSignatureValidation: webhookControllerTs.includes("verifyWebhookSignature"),
    clubRateLimit: webhookControllerTs.includes('namespace: "club_whisky_webhook"'),
  },
  environment: {
    nodeEnv,
    requiredEnvKeysPresent: missingEnvKeys.length === 0,
    localhostOnlyUrlsInExample:
      appUrl.includes("localhost") &&
      publicAppUrl.includes("localhost") &&
      apiUrl.includes("localhost") &&
      nextPublicApiUrl.includes("localhost"),
    localhostConsistent:
      localhostHosts.length > 0 &&
      localhostHosts.every((host) => !host || host.startsWith("localhost")),
    frontendApiHostMatches: sameHost(apiUrl, nextPublicApiUrl),
    appPublicHostMatches: sameHost(appUrl, publicAppUrl),
    googleRedirectHostMatchesApi: sameHost(googleRedirectUri, apiUrl),
    appPortNormalizedForDev: readPort(appUrl) === "3002" && readPort(publicAppUrl) === "3002",
  },
};

const releaseWarnings = [];
if (!checks.headers.contentSecurityPolicy) {
  releaseWarnings.push("Content-Security-Policy ausente em apps/api/src/main.ts");
}
if (!checks.headers.crossOriginOpenerPolicy) {
  releaseWarnings.push("Cross-Origin-Opener-Policy ausente em apps/api/src/main.ts");
}
if (!checks.cookies.secureInProduction) {
  releaseWarnings.push("Cookie de sessao sem atributo Secure por ambiente");
}
if (!checks.cookies.pathRoot) {
  releaseWarnings.push("Cookie de sessao sem Path=/");
}
if (!checks.webhooks.clubSignatureValidation) {
  releaseWarnings.push("Webhook do Dose Club sem validacao HMAC");
}
if (!checks.environment.requiredEnvKeysPresent) {
  releaseWarnings.push(`.env.example sem chaves obrigatorias: ${missingEnvKeys.join(", ")}`);
}
if (!checks.environment.localhostConsistent) {
  releaseWarnings.push("URLs locais misturam localhost e outros hosts");
}
if (!checks.environment.frontendApiHostMatches) {
  releaseWarnings.push("API_URL e NEXT_PUBLIC_API_URL usam hosts diferentes");
}
if (!checks.environment.appPublicHostMatches) {
  releaseWarnings.push("APP_URL e PUBLIC_APP_URL usam hosts diferentes");
}
if (!checks.environment.googleRedirectHostMatchesApi) {
  releaseWarnings.push("GOOGLE_OAUTH_REDIRECT_URI usa host diferente de API_URL");
}
if (!checks.environment.appPortNormalizedForDev) {
  releaseWarnings.push("APP_URL/PUBLIC_APP_URL ainda nao estao normalizados para localhost:3002");
}

const summary = {
  envExamplePlaceholdersOnly: envWarnings.length === 0,
  suspiciousEnvTokens: envWarnings,
  missingEnvKeys,
  requiredFiles: fileChecks,
  checks,
  releaseWarnings,
  releaseChecklist: [
    "Rodar Codex Security antes de PR/release.",
    "Validar MFA em perfis plataforma/dono/financeiro.",
    "Conferir webhooks com assinatura e idempotencia.",
    "Validar headers/cookies por ambiente antes de publicar.",
    "Revisar logs para ausencia de segredos.",
  ],
};

console.log(JSON.stringify(summary, null, 2));

if (
  envWarnings.length > 0 ||
  missing.length > 0 ||
  !checks.headers.xContentTypeOptions ||
  !checks.headers.xFrameOptions ||
  !checks.headers.contentSecurityPolicy ||
  !checks.headers.crossOriginOpenerPolicy ||
  !checks.cookies.httpOnly ||
  !checks.cookies.sameSite ||
  !checks.cookies.secureInProduction ||
  !checks.cookies.pathRoot ||
  !checks.webhooks.asaasSecretGuard ||
  !checks.webhooks.clubSecretRequired ||
  !checks.webhooks.clubSignatureValidation ||
  !checks.webhooks.clubRateLimit ||
  !checks.environment.requiredEnvKeysPresent ||
  !checks.environment.localhostConsistent ||
  !checks.environment.frontendApiHostMatches ||
  !checks.environment.appPublicHostMatches ||
  !checks.environment.googleRedirectHostMatchesApi ||
  !checks.environment.appPortNormalizedForDev
) {
  process.exitCode = 1;
}

function readSimpleEnv(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=").trim()];
      }),
  );
}

function sameHost(left, right) {
  try {
    return new URL(left).host === new URL(right).host;
  } catch {
    return false;
  }
}

function readHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function readPort(value) {
  try {
    return new URL(value).port || (new URL(value).protocol === "https:" ? "443" : "80");
  } catch {
    return "";
  }
}
