import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { AsaasProvider } from "./asaas-provider";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, AsaasProvider, RateLimitService],
  exports: [PaymentsService, AsaasProvider],
})
export class PaymentsModule {}
