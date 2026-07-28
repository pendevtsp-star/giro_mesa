import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { ApprovalsController } from "./approvals.controller";
import { DatabaseApprovalsRepository } from "./approvals.repository";
import {
  APPROVAL_APPLICATOR,
  APPROVALS_REPOSITORY,
  ApprovalApplicatorRegistry,
  ApprovalsService,
} from "./approvals.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ApprovalsController],
  providers: [
    DatabaseApprovalsRepository,
    {
      provide: APPROVALS_REPOSITORY,
      useExisting: DatabaseApprovalsRepository,
    },
    ApprovalApplicatorRegistry,
    {
      provide: APPROVAL_APPLICATOR,
      useExisting: ApprovalApplicatorRegistry,
    },
    ApprovalsService,
  ],
  exports: [ApprovalsService, ApprovalApplicatorRegistry],
})
export class ApprovalsModule {}
