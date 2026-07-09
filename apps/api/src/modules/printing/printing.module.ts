import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConnectorAuthService } from "./connector-auth.service";
import { PrintingController } from "./printing.controller";
import { PrintingService } from "./printing.service";

@Module({
  imports: [AuthModule],
  controllers: [PrintingController],
  providers: [PrintingService, ConnectorAuthService],
  exports: [PrintingService],
})
export class PrintingModule {}
