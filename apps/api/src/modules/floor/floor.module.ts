import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { FloorController } from "./floor.controller";
import { FloorService } from "./floor.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [FloorController],
  providers: [FloorService],
  exports: [FloorService],
})
export class FloorModule {}
