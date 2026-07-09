import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FiscalModule } from "../fiscal/fiscal.module";
import { PosController } from "./pos.controller";
import { PosService } from "./pos.service";

@Module({
  imports: [AuthModule, FiscalModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
