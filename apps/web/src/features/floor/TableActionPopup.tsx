"use client";

import {
  ArrowRight,
  BookOpen,
  CreditCard,
  FileText,
  Flame,
  Plus,
  Receipt,
  ShoppingBag,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DiningTable } from "../../lib/giromesa-api";

type Action = {
  id: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  free: "Livre",
  occupied: "Em atendimento",
  waiting_order: "Aguardando",
  order_sent: "Cozinha",
  preparing: "Em preparo",
  served: "Servida",
  waiting_payment: "Pagamento",
  reserved: "Reserva",
  blocked: "Bloqueada",
};

const STATUS_COLORS: Record<string, string> = {
  free: "#10b981",
  occupied: "#f59e0b",
  waiting_order: "#8b5cf6",
  order_sent: "#3b82f6",
  preparing: "#3b82f6",
  served: "#10b981",
  waiting_payment: "#ef4444",
  reserved: "#6b7280",
  blocked: "#ef4444",
};

function getActions(table: DiningTable): Action[] {
  const actions: Action[] = [];

  switch (table.status) {
    case "free":
      actions.push({ id: "new-order", label: "Novo pedido", icon: <Plus size={16} /> });
      actions.push({ id: "reserve", label: "Reservar", icon: <BookOpen size={16} /> });
      break;
    case "occupied":
    case "waiting_order":
    case "order_sent":
    case "preparing":
    case "served":
      actions.push(
        { id: "view-order", label: "Ver pedido", icon: <BookOpen size={16} /> },
        { id: "add-item", label: "Adicionar item", icon: <ShoppingBag size={16} /> },
        { id: "send-kitchen", label: "Enviar cozinha", icon: <Flame size={16} /> },
        { id: "preview-bill", label: "Prévia da conta", icon: <FileText size={16} /> },
        { id: "close-account", label: "Fechar conta", icon: <CreditCard size={16} /> },
      );
      break;
    case "waiting_payment":
      actions.push(
        { id: "view-order", label: "Ver pedido", icon: <BookOpen size={16} /> },
        { id: "preview-bill", label: "Prévia da conta", icon: <Receipt size={16} /> },
        { id: "close-account", label: "Fechar conta", icon: <CreditCard size={16} /> },
      );
      break;
    case "reserved":
      actions.push({ id: "cancel-reserve", label: "Cancelar reserva", icon: <X size={16} /> });
      break;
  }

  if (table.groupId) {
    actions.push({
      id: "unmerge",
      label: "Separar mesas",
      icon: <Unlink size={16} />,
      destructive: true,
    });
  }

  actions.push({ id: "goto-pos", label: "Abrir PDV completo", icon: <ArrowRight size={16} /> });

  return actions;
}

type TableActionPopupProps = {
  table: DiningTable;
  groupTables?: DiningTable[];
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: string, table: DiningTable, data?: Record<string, unknown>) => void;
};

export function TableActionPopup({
  table,
  groupTables,
  position,
  onClose,
  onAction,
}: TableActionPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showReserveInput, setShowReserveInput] = useState(false);
  const [reserveName, setReserveName] = useState(table.reservedName ?? "");
  const actions = getActions(table);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function handleAction(actionId: string) {
    if (actionId === "reserve") {
      setShowReserveInput(true);
      return;
    }
    onAction(actionId, table);
    onClose();
  }

  function handleReserve() {
    onAction("reserve", table, { reservedName: reserveName.trim() || null });
    onClose();
  }

  const gColor = table.groupId
    ? ["#f97316", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"][0]
    : undefined;

  const popupWidth = 240;
  const x = Math.min(position.x, window.innerWidth - popupWidth - 16);
  const y = Math.min(position.y, window.innerHeight - 300);

  return (
    <div ref={ref} className="table-action-popup" style={{ left: x, top: y }}>
      <div className="popup-header">
        <div>
          <strong>{table.code}</strong>
          <span className="popup-table-name">{table.name}</span>
          {groupTables && groupTables.length > 1 && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {groupTables.map((gt) => (
                <span
                  key={gt.id}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${gColor}22`,
                    color: gColor,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    border: `1px solid ${gColor}44`,
                  }}
                >
                  {gt.code}
                </span>
              ))}
            </div>
          )}
        </div>
        <button className="popup-close" onClick={onClose} aria-label="Fechar" type="button">
          <X size={14} />
        </button>
      </div>
      <div className="popup-meta">
        <span
          className="popup-status-dot"
          style={{ background: STATUS_COLORS[table.status] ?? "#6b7280" }}
        />
        {STATUS_LABELS[table.status] ?? table.status}
        <span className="popup-seats">· {table.seats} lugares</span>
        {table.reservedName && (
          <span style={{ color: "#6b7280", fontStyle: "italic" }}>· {table.reservedName}</span>
        )}
      </div>

      {showReserveInput ? (
        <div style={{ padding: "8px 14px 12px" }}>
          <label
            htmlFor="table-reservation-name"
            style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: 4 }}
          >
            Nome da reserva (opcional)
          </label>
          <input
            id="table-reservation-name"
            type="text"
            value={reserveName}
            onChange={(e) => setReserveName(e.target.value)}
            placeholder="Ex: Silva, Mesa 4, 20h"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: "0.85rem",
              marginBottom: 8,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleReserve();
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="button primary"
              type="button"
              style={{ flex: 1, padding: "6px 12px", fontSize: "0.8rem" }}
              onClick={handleReserve}
            >
              Confirmar
            </button>
            <button
              className="button ghost"
              type="button"
              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              onClick={() => {
                setShowReserveInput(false);
                setReserveName("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="popup-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`popup-action-btn ${action.destructive ? "destructive" : ""}`}
              type="button"
              onClick={() => handleAction(action.id)}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { STATUS_COLORS, STATUS_LABELS };
