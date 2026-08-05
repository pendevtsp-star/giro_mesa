import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PosModule } from "../pos/pos.module";
import { PaymentReconciliationController } from "./payment-reconciliation.controller";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { StaffFinanceController } from "./staff-finance.controller";
import { StaffFinanceService } from "./staff-finance.service";

@Module({
  imports: [AuthModule, DatabaseModule, forwardRef(() => PosModule)],
  controllers: [StaffFinanceController, PaymentReconciliationController],
  providers: [StaffFinanceService, PaymentReconciliationService],
  exports: [StaffFinanceService, PaymentReconciliationService],
})
export class StaffFinanceModule {}
