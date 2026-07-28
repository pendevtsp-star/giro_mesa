export type SalonPosition = { x: number; y: number };

type SalonTableRef = {
  id: string;
  groupId?: string | null;
};

export function moveTablesInLayout(
  layout: Record<string, SalonPosition>,
  tables: SalonTableRef[],
  draggedTableId: string,
  delta: SalonPosition,
): Record<string, SalonPosition> {
  const draggedTable = tables.find((table) => table.id === draggedTableId);
  if (!draggedTable) return layout;

  const movedTableIds = new Set(
    draggedTable.groupId
      ? tables.filter((table) => table.groupId === draggedTable.groupId).map((table) => table.id)
      : [draggedTableId],
  );

  const next = { ...layout };
  for (const tableId of movedTableIds) {
    const current = layout[tableId] ?? { x: 0, y: 0 };
    next[tableId] = {
      x: current.x + delta.x,
      y: current.y + delta.y,
    };
  }
  return next;
}
