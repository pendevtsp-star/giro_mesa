import { Module } from "@nestjs/common";
import { RateLimitService } from "../../common/rate-limit";
import { AuthModule } from "../auth/auth.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, RateLimitService],
})
export class CatalogModule {}
