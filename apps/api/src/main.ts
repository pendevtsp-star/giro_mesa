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
  );

  app.enableCors({
    origin: env.NODE_ENV === "production" ? [env.APP_URL] : true,
    credentials: true,
  });

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "webhooks/asaas", method: RequestMethod.POST },
      { path: "webhooks/meta", method: RequestMethod.POST },
      { path: "webhooks/ifood", method: RequestMethod.POST },
    ],
  });

  await app.listen(3333, "0.0.0.0");
  Logger.log("API ready on http://localhost:3333", "Bootstrap");
}

void bootstrap();
