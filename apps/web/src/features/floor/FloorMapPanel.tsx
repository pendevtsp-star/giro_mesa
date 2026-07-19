"use client";

import { Badge } from "@giromesa/ui";
import { readTableDetail } from "../../lib/formatters/app-dashboard";
import type { DiningTable } from "../../lib/giromesa-api";

type FloorMapPanelProps = {
  tables: DiningTable[];
  selectedTableId: string | null;
  onSelectTable: (table: DiningTable) => void;
};

export function FloorMapPanel({ tables, selectedTableId, onSelectTable }: FloorMapPanelProps) {
  return (
    <article className="panel floor-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Salão</span>
          <h2>Mapa de mesas</h2>
        </div>
        <Badge tone="info">{tables.length} mesas</Badge>
      </div>
      <div className="floor-grid">
        {tables.slice(0, 8).map((table, index) => (
          <button
            className={`table-tile table-${table.status} ${
              table.id === selectedTableId ? "selected-table" : ""
            }`}
            type="button"
            key={table.id}
            data-testid={index === 1 ? "pos-open-table" : undefined}
            onClick={() => onSelectTable(table)}
          >
            <strong>{table.code}</strong>
            <span>{table.seats} lugares</span>
            <small>{readTableDetail(table)}</small>
          </button>
        ))}
      </div>
    </article>
  );
}
