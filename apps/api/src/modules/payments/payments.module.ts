import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { PosModule } from "../pos/pos.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [AuthModule, PosModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RateLimitService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
