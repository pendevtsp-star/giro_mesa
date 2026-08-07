import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { ClubWhiskyController } from "./club-whisky.controller";
import { ClubWhiskyService } from "./club-whisky.service";
import { IfoodProvider } from "./ifood-provider";
import { IntegrationAuthService } from "./integration-auth.service";
import { OutboxController } from "./outbox.controller";
import { OutboxService } from "./outbox.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { WhatsappQrController } from "./whatsapp-qr.controller";
import { WhatsappQrService } from "./whatsapp-qr.service";

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController, ClubWhiskyController, OutboxController, WhatsappQrController],
  providers: [
    WebhooksService,
    ClubWhiskyService,
    OutboxService,
    IntegrationAuthService,
    RateLimitService,
    IfoodProvider,
    WhatsappQrService,
  ],
  exports: [IfoodProvider],
})
export class IntegrationsModule {}
