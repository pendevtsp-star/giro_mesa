import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PosModule } from "../pos/pos.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthModule, DatabaseModule, InventoryModule, PosModule],
  controllers: [HealthController],
})
export class HealthModule {}
