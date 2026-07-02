import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { KdsModule } from "./modules/kds/kds.module";
import { PosModule } from "./modules/pos/pos.module";
import { TenantsModule } from "./modules/tenants/tenants.module";

@Module({
  imports: [
    HealthModule,
    DatabaseModule,
    TenantsModule,
    AuthModule,
    CatalogModule,
    PosModule,
    KdsModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
