import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "docs/SECURITY.md",
  "docs/legal/PRIVACY_POLICY.md",
  "docs/legal/TERMS_OF_USE.md",
  "apps/api/src/common/security.ts",
  "apps/api/src/common/security-headers.ts",
  "apps/api/src/common/webhook-signature.ts",
  "apps/api/src/modules/integrations/webhooks.controller.ts",
  "apps/api/src/common/http.ts",
  "apps/api/src/main.ts",
  "apps/api/src/common/csp.ts",
  "apps/api/src/common/sanitized-logger.ts",
  "apps/web/src/app/api/csp-report/route.ts",
  "security/trivy-exceptions.json",
  "scripts/workflow-gate.mjs",
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
const behaviorTests = {
  releaseWorkflows: runNodeScript("scripts/workflow-gate.mjs"),
  apiHeaders: runBehaviorTests("@giromesa/api", ["src/common/security-headers.test.ts"]),
  webCsp: runBehaviorTests("@giromesa/web", [
    "src/app/api/csp-report/route.test.ts",
    "src/lib/csp-config.test.mjs",
  ]),
  cookies: runBehaviorTests("@giromesa/api", ["src/common/http.test.ts"]),
  webhooks: runBehaviorTests("@giromesa/api", [
    "src/modules/integrations/webhooks.controller.test.ts",
  ]),
};
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
    xContentTypeOptions: behaviorTests.apiHeaders,
    xFrameOptions: behaviorTests.apiHeaders,
    contentSecurityPolicy: behaviorTests.apiHeaders && behaviorTests.webCsp,
    reportOnlyIsAdditional: behaviorTests.webCsp,
    referrerPolicy: behaviorTests.apiHeaders,
    permissionsPolicy: behaviorTests.apiHeaders,
    crossOriginOpenerPolicy: behaviorTests.apiHeaders,
    corsRestrictedInProduction: behaviorTests.apiHeaders,
  },
  cookies: {
    httpOnly: behaviorTests.cookies,
    sameSite: behaviorTests.cookies,
    secureInProduction: behaviorTests.cookies,
    pathRoot: behaviorTests.cookies,
  },
  webhooks: {
    asaasSecretGuard: behaviorTests.webhooks,
    clubSecretRequired: behaviorTests.webhooks,
    clubSignatureValidation: behaviorTests.webhooks,
    clubRateLimit: behaviorTests.webhooks,
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
if (!checks.headers.reportOnlyIsAdditional) {
  releaseWarnings.push("CSP report-only da Web deve ser adicional à política bloqueante");
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
if (!behaviorTests.releaseWorkflows) {
  releaseWarnings.push("Deploy nao depende dos gates bloqueantes de seguranca e cobertura");
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
  behaviorTests,
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
  !behaviorTests.releaseWorkflows ||
  !checks.headers.xContentTypeOptions ||
  !checks.headers.xFrameOptions ||
  !checks.headers.contentSecurityPolicy ||
  !checks.headers.reportOnlyIsAdditional ||
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

function runBehaviorTests(workspace, files) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    return false;
  }

  const result = spawnSync(
    process.execPath,
    [npmExecPath, "--filter", workspace, "exec", "vitest", "run", ...files],
    { encoding: "utf8", env: process.env, stdio: "pipe" },
  );
  return result.status === 0;
}

function runNodeScript(path) {
  return (
    spawnSync(process.execPath, [path], {
      encoding: "utf8",
      env: process.env,
      stdio: "pipe",
    }).status === 0
  );
}

function readPort(value) {
  try {
    return new URL(value).port || (new URL(value).protocol === "https:" ? "443" : "80");
  } catch {
    return "";
  }
}
