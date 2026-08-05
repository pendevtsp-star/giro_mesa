import { BadRequestException, Controller, Headers, Inject, Query, Sse } from "@nestjs/common";
import { from, map, switchMap } from "rxjs";
import type { HeaderRecord } from "../../common/http";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { OperationalRealtimeService } from "./operational-realtime.service";
import { PosService } from "./pos.service";

@Controller("realtime")
export class RealtimeController {
  constructor(
    @Inject(PosService) private readonly posService: PosService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(OperationalRealtimeService)
    private readonly realtime: OperationalRealtimeService,
  ) {}

  @Sse("events")
  events(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    return from(this.resolveContext(headers)).pipe(
      switchMap(async (context) => {
        await this.posService.listOperationalEvents(context, branchId, 0, 1);
        return context;
      }),
      switchMap((context) => this.realtime.stream(context.tenantId, branchId)),
      map((batch) => ({
        id: String(batch.toVersion),
        type: "operation.delta",
        retry: 1_000,
        data: batch,
      })),
    );
  }

  private async resolveContext(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "pos:operate");
    return context;
  }
}
