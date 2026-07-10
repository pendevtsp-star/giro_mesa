import "reflect-metadata";
import { loadEnv } from "@giromesa/config";
import { Logger, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

const env = loadEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: env.NODE_ENV !== "test" }),
    { rawBody: true },
  );

  const fastify = app.getHttpAdapter().getInstance();
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
