import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CertificateService } from "./certificate.service";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";

@Module({
  imports: [AuthModule],
  controllers: [FiscalController],
  providers: [FiscalService, CertificateService],
  exports: [FiscalService, CertificateService],
})
export class FiscalModule {}
