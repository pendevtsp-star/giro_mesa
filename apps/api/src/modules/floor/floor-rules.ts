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

export function assertTablesCanSeatParty(
  tables: Array<{ status: TableStatus; seats: number }>,
  partySize: number,
) {
  if (tables.length === 0) throw new BadRequestException("Select at least one table");
  for (const table of tables) {
    if (!["free", "reserved"].includes(table.status)) {
      throw new BadRequestException("Table is unavailable");
    }
  }
  if (tables.reduce((total, table) => total + table.seats, 0) < partySize) {
    throw new BadRequestException("Combined table capacity is insufficient");
  }
}
