import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { QrController } from "./qr.controller";
import { QrService } from "./qr.service";

@Module({
  imports: [AuthModule],
  controllers: [QrController],
  providers: [QrService, RateLimitService],
  exports: [QrService],
})
export class QrModule {}
