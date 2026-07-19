import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, RateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
