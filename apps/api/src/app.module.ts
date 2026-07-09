import { Module } from "@nestjs/common";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DatabaseModule } from "./modules/database/database.module";
import { FiscalModule } from "./modules/fiscal/fiscal.module";
import { HealthModule } from "./modules/health/health.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { KdsModule } from "./modules/kds/kds.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { PosModule } from "./modules/pos/pos.module";
import { PrintingModule } from "./modules/printing/printing.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { TenantsModule } from "./modules/tenants/tenants.module";

@Module({
  imports: [
    HealthModule,
    DatabaseModule,
    TenantsModule,
    AuthModule,
    CatalogModule,
    PosModule,
    FiscalModule,
    InventoryModule,
    KdsModule,
    PrintingModule,
    ReportsModule,
    PlatformModule,
    IntegrationsModule,
    AuditModule,
  ],
})
export class AppModule {}
