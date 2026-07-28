import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BackupService } from "./backup.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, BackupService],
})
export class PlatformModule {}
