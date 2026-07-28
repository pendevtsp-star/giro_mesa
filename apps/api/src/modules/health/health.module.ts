import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PosModule } from "../pos/pos.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [DatabaseModule, InventoryModule, PosModule],
  controllers: [HealthController],
})
export class HealthModule {}
