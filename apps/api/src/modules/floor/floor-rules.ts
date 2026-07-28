import type { TableStatus } from "@giromesa/domain";
import { BadRequestException } from "@nestjs/common";

export function assertTableCanSeatParty(
  table: { status: TableStatus; seats: number },
  partySize: number,
) {
  if (!["free", "reserved"].includes(table.status)) {
    throw new BadRequestException("Table is unavailable");
  }
  if (table.seats < partySize) {
    throw new BadRequestException("Table capacity is insufficient");
  }
}
