import "reflect-metadata";
import { loadEnv } from "@giromesa/config";
import { Logger, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { verifyCsrfToken } from "./common/csrf";
import { firstHeader, parseCookies } from "./common/http";

const env = loadEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: env.NODE_ENV !== "test" }),
    { rawBody: true },
  );

  const fastify = app.getHttpAdapter().getInstance();
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

  fastify.addHook(
    "onSend",
    async (
      _request: unknown,
      reply: { header: (key: string, value: string) => void },
      payload: unknown,
    ) => {
      reply.header("x-content-type-options", "nosniff");
      reply.header("x-frame-options", "DENY");
      reply.header("referrer-policy", "same-origin");
      reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
      reply.header("cross-origin-opener-policy", "same-origin");
      reply.header(
        "content-security-policy",
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' http: https: ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      return payload;
    },
  );

  app.enableCors({
    origin: env.NODE_ENV === "production" ? [env.APP_URL] : true,
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

  await app.listen(3333, "0.0.0.0");
  Logger.log("API ready on http://localhost:3333", "Bootstrap");
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
