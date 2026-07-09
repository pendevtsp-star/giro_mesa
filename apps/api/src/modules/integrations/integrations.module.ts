import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { ClubWhiskyController } from "./club-whisky.controller";
import { ClubWhiskyService } from "./club-whisky.service";
import { IntegrationAuthService } from "./integration-auth.service";
import { OutboxController } from "./outbox.controller";
import { OutboxService } from "./outbox.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController, ClubWhiskyController, OutboxController],
  providers: [
    WebhooksService,
    ClubWhiskyService,
    OutboxService,
    IntegrationAuthService,
    RateLimitService,
  ],
})
export class IntegrationsModule {}
