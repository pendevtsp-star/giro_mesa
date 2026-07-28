import { Module } from "@nestjs/common";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DatabaseModule } from "./modules/database/database.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { FiscalModule } from "./modules/fiscal/fiscal.module";
import { FloorModule } from "./modules/floor/floor.module";
import { HealthModule } from "./modules/health/health.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { KdsModule } from "./modules/kds/kds.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { PosModule } from "./modules/pos/pos.module";
import { PrintingModule } from "./modules/printing/printing.module";
import { QrModule } from "./modules/qr/qr.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { TenantsModule } from "./modules/tenants/tenants.module";

@Module({
  imports: [
    HealthModule,
    DatabaseModule,
    TenantsModule,
    AuthModule,
    CatalogModule,
    CustomersModule,
    DeliveryModule,
    PosModule,
    FiscalModule,
    FloorModule,
    InventoryModule,
    KdsModule,
    OnboardingModule,
    PrintingModule,
    QrModule,
    ReportsModule,
    PlatformModule,
    IntegrationsModule,
    AuditModule,
    ApprovalsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
