import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { AuthModule } from "../auth/auth.module";
import { FiscalModule } from "../fiscal/fiscal.module";
import { CashRepository } from "./cash.repository";
import { CashService } from "./cash.service";
import { OperationalService } from "./operational.service";
import { OrderRepository } from "./order.repository";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "./payments.service";
import { PosController } from "./pos.controller";
import { PosRepository } from "./pos.repository";
import { PosService } from "./pos.service";
import { RealtimeController } from "./realtime.controller";
import { ShiftRepository } from "./shift.repository";
import { ShiftService } from "./shift.service";

@Module({
  imports: [AuthModule, FiscalModule, ApprovalsModule],
  controllers: [PosController, RealtimeController],
  providers: [
    PosService,
    PosRepository,
    OrderRepository,
    CashRepository,
    ShiftRepository,
    OrdersService,
    OperationalService,
    PaymentsService,
    CashService,
    ShiftService,
  ],
  exports: [PosService],
})
export class PosModule {}
