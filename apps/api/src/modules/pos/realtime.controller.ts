import { BadRequestException, Controller, Headers, Inject, Query, Sse } from "@nestjs/common";
import { distinctUntilChanged, from, interval, map, startWith, switchMap } from "rxjs";
import type { HeaderRecord } from "../../common/http";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { PosService } from "./pos.service";

@Controller("realtime")
export class RealtimeController {
  constructor(
    @Inject(PosService) private readonly posService: PosService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Sse("events")
  events(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    return from(this.resolveContext(headers)).pipe(
      switchMap((context) =>
        interval(5000).pipe(
          startWith(0),
          switchMap(() => from(this.posService.getOperationalEventSnapshot(context, branchId))),
          distinctUntilChanged((previous, current) => previous.signature === current.signature),
          map((snapshot) => ({
            id: snapshot.signature,
            type: "operation.changed",
            retry: 5000,
            data: snapshot,
          })),
        ),
      ),
    );
  }

  private async resolveContext(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "pos:operate");
    return context;
  }
}
