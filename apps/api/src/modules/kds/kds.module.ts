import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { KdsController } from "./kds.controller";
import { KdsService } from "./kds.service";

@Module({
  imports: [AuthModule],
  controllers: [KdsController],
  providers: [KdsService],
})
export class KdsModule {}
