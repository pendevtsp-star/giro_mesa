import "reflect-metadata";
import { loadEnv } from "@giromesa/config";
import { Logger, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { verifyCsrfToken } from "./common/csrf";
import { firstHeader, parseCookies } from "./common/http";
import { metricsMiddleware } from "./common/metrics.middleware";
import { SanitizedExceptionFilter } from "./common/sanitized-exception.filter";
import { SanitizedLogger } from "./common/sanitized-logger";
import { corsOrigin, registerSecurityHeaders } from "./common/security-headers";

const env = loadEnv();
const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: env.NODE_ENV !== "test",
      maxParamLength: 1024,
      trustProxy: trustedProxyCidrs.length > 0 ? trustedProxyCidrs : false,
    }),
    { rawBody: true },
  );

  const fastify = app.getHttpAdapter().getInstance();
  app.useLogger(new SanitizedLogger());
  app.useGlobalFilters(new SanitizedExceptionFilter());

  // Metrics middleware - track all requests
  fastify.addHook("preHandler", metricsMiddleware);

  fastify.addHook("preHandler", async (request, reply) => {
    if (!requiresCsrfProtection(request.method, request.url)) {
      return;
    }

    const cookieHeader = firstHeader(request.headers.cookie);
    const sessionToken = parseCookies(cookieHeader).get("gm_session");
    if (!sessionToken) {
      return;
    }

    const token = firstHeader(request.headers["x-csrf-token"]);
    if (!verifyCsrfToken({ token, sessionToken, secret: env.SESSION_SECRET })) {
      return reply.code(403).send({
        error: "csrf_invalid",
        message: "Sessao protegida contra requisicoes invalidas.",
      });
    }
  });

  registerSecurityHeaders(fastify);

  app.enableCors({
    origin: corsOrigin(env.NODE_ENV, env.APP_URL),
    credentials: true,
  });

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
      { path: "webhooks/asaas", method: RequestMethod.POST },
      { path: "webhooks/meta", method: RequestMethod.POST },
      { path: "webhooks/ifood", method: RequestMethod.POST },
      { path: "webhooks/club-whisky", method: RequestMethod.POST },
    ],
  });

  await app.listen(env.API_PORT, "0.0.0.0");
  Logger.log(`API ready on http://localhost:${env.API_PORT}`, "Bootstrap");
}

void bootstrap();

function requiresCsrfProtection(method: string, url: string) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const pathname = url.split("?")[0] ?? url;
  if (
    pathname === "/api/v1/auth/login" ||
    pathname === "/api/v1/auth/csrf" ||
    pathname.startsWith("/api/v1/catalog/public/") ||
    pathname.startsWith("/webhooks/")
  ) {
    return false;
  }

  return pathname.startsWith("/api/v1/");
}
