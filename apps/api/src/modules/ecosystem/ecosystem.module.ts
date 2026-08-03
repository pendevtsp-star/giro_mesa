import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { EcosystemController, FederationController } from "./ecosystem.controller";
import { EcosystemService } from "./ecosystem.service";

@Module({
  imports: [AuthModule],
  controllers: [EcosystemController, FederationController],
  providers: [EcosystemService, RateLimitService],
  exports: [EcosystemService],
})
export class EcosystemModule {}
