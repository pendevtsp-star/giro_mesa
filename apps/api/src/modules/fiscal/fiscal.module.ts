import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CertificateService } from "./certificate.service";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";
import { FiscalCredentialsService } from "./fiscal-credentials.service";
import { FiscalOnboardingService } from "./fiscal-onboarding.service";
import { FiscalWebhookController } from "./fiscal-webhook.controller";

@Module({
  imports: [AuthModule],
  controllers: [FiscalController, FiscalWebhookController],
  providers: [FiscalService, CertificateService, FiscalCredentialsService, FiscalOnboardingService],
  exports: [FiscalService, CertificateService, FiscalCredentialsService, FiscalOnboardingService],
})
export class FiscalModule {}
