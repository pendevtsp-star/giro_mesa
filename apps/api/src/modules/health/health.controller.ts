import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "giromesa-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    try {
      await this.database.db.execute(sql`select 1`);
      return {
        status: "ok",
        service: "giromesa-api",
        checks: { database: "ok" },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
        service: "giromesa-api",
        checks: { database: "unavailable" },
      });
    }
  }
}
