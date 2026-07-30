export type SalonPosition = { x: number; y: number };

type SalonTableRef = {
  id: string;
  groupId?: string | null;
};

type SalonBounds = {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
};

type SalonViewport = {
  width: number;
  height: number;
  tableWidth?: number;
  tableHeight?: number;
  gap?: number;
};

export function moveTablesInLayout(
  layout: Record<string, SalonPosition>,
  tables: SalonTableRef[],
  draggedTableId: string,
  delta: SalonPosition,
  bounds: SalonBounds = {},
): Record<string, SalonPosition> {
  const draggedTable = tables.find((table) => table.id === draggedTableId);
  if (!draggedTable) return layout;

  const movedTableIds = [
    ...new Set(
      draggedTable.groupId
        ? tables.filter((table) => table.groupId === draggedTable.groupId).map((table) => table.id)
        : [draggedTableId],
    ),
  ];
  const positions = movedTableIds.map((tableId) => layout[tableId] ?? { x: 0, y: 0 });
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position) => position.y));
  const boundedDelta = {
    x: clampDelta(delta.x, minX, maxX, bounds.minX ?? 0, bounds.maxX ?? 100),
    y: clampDelta(delta.y, minY, maxY, bounds.minY ?? 0, bounds.maxY ?? 100),
  };

  const next = { ...layout };
  for (const tableId of movedTableIds) {
    const current = layout[tableId] ?? { x: 0, y: 0 };
    next[tableId] = {
      x: current.x + boundedDelta.x,
      y: current.y + boundedDelta.y,
    };
  }
  return next;
}

export function arrangeTablesForMerge(
  layout: Record<string, SalonPosition>,
  tableIds: string[],
  viewport: SalonViewport,
): Record<string, SalonPosition> {
  const ids = [...new Set(tableIds)].filter(Boolean);
  if (ids.length < 2 || viewport.width <= 0 || viewport.height <= 0) return layout;

  const tableWidth = viewport.tableWidth ?? 175;
  const tableHeight = viewport.tableHeight ?? 136;
  const gap = viewport.gap ?? 12;
  const stepX = ((tableWidth + gap) / viewport.width) * 100;
  const stepY = ((tableHeight + gap) / viewport.height) * 100;
  const maxX = Math.max(0, 100 - (tableWidth / viewport.width) * 100);
  const maxY = Math.max(0, 100 - (tableHeight / viewport.height) * 100);
  const columns = Math.min(ids.length, 4);
  const anchor = layout[ids[0] ?? ""] ?? { x: 4, y: 4 };
  const raw = ids.map((tableId, index) => ({
    tableId,
    x: anchor.x + (index % columns) * stepX,
    y: anchor.y + Math.floor(index / columns) * stepY,
  }));
  const shiftX = Math.min(0, maxX - Math.max(...raw.map((position) => position.x)));
  const shiftY = Math.min(0, maxY - Math.max(...raw.map((position) => position.y)));
  const normalizedShiftX = Math.max(shiftX, -Math.min(...raw.map((position) => position.x)));
  const normalizedShiftY = Math.max(shiftY, -Math.min(...raw.map((position) => position.y)));
  const next = { ...layout };

  for (const position of raw) {
    next[position.tableId] = {
      x: position.x + normalizedShiftX,
      y: position.y + normalizedShiftY,
    };
  }

  return next;
}

function clampDelta(
  requested: number,
  currentMin: number,
  currentMax: number,
  allowedMin: number,
  allowedMax: number,
) {
  if (currentMin + requested < allowedMin) return allowedMin - currentMin;
  if (currentMax + requested > allowedMax) return allowedMax - currentMax;
  return requested;
}
