"use client";

import { Badge } from "@giromesa/ui";
import { Bell, ChefHat, X } from "lucide-react";
import type { QrPendingOrder } from "../../lib/giromesa-api";
import type { RealtimeStatus } from "../dashboard/dashboard-types";

type QrDrafts = Record<string, { quantity: string; notes: string }>;

type QrOperationsPanelProps = {
  realtimeStatus: RealtimeStatus;
  qrAlert: string | null;
  orders: QrPendingOrder[];
  selectedOrder: QrPendingOrder | null;
  drafts: QrDrafts;
  rejectReason: string;
  isApiReady: boolean;
  isBusy: boolean;
  onDismissAlert: () => void;
  onSelectOrder: (orderId: string) => void;
  onDraftsChange: (updater: (current: QrDrafts) => QrDrafts) => void;
  onRejectReasonChange: (value: string) => void;
  onUpdateItem: (order: QrPendingOrder, itemId: string) => void;
  onCancelItem: (order: QrPendingOrder, itemId: string) => void;
  onRejectOrder: (order: QrPendingOrder) => void;
  onSendToKitchen: (order: QrPendingOrder) => void;
  formatMoney: (amountCents: number) => string;
  readRealtimeStatus: (status: RealtimeStatus) => string;
  readQrOrderLabel: (order: QrPendingOrder) => string;
  readQrOrderSummary: (order: QrPendingOrder) => string;
  readRelativeTime: (date: string) => string;
};

export function QrOperationsPanel({
  realtimeStatus,
  qrAlert,
  orders,
  selectedOrder,
  drafts,
  rejectReason,
  isApiReady,
  isBusy,
  onDismissAlert,
  onSelectOrder,
  onDraftsChange,
  onRejectReasonChange,
  onUpdateItem,
  onCancelItem,
  onRejectOrder,
  onSendToKitchen,
  formatMoney,
  readRealtimeStatus,
  readQrOrderLabel,
  readQrOrderSummary,
  readRelativeTime,
}: QrOperationsPanelProps) {
  return (
    <article className="panel qr-ops-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Cardápio QR</span>
          <h2>Pedidos recebidos</h2>
        </div>
        <div className="qr-panel-badges">
          <span className={`realtime-pill realtime-pill-${realtimeStatus}`}>
            {readRealtimeStatus(realtimeStatus)}
          </span>
          <Badge tone={orders.length > 0 ? "warn" : "good"}>
            {orders.length > 0 ? `${orders.length} pendente(s)` : "sem fila"}
          </Badge>
        </div>
      </div>
      {qrAlert ? (
        <div className="qr-alert" role="status">
          <Bell size={16} />
          <span>{qrAlert}</span>
          <button className="icon-button" type="button" onClick={onDismissAlert}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="qr-review-layout">
        {orders.length > 0 ? (
          <>
            <div className="qr-order-list">
              {orders.slice(0, 6).map((order) => (
                <button
                  className={`qr-order-chip ${order.id === selectedOrder?.id ? "selected" : ""}`}
                  type="button"
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                >
                  <strong>{readQrOrderLabel(order)}</strong>
                  <span>{readQrOrderSummary(order)}</span>
                  <small>{formatMoney(order.totalCents)}</small>
                </button>
              ))}
            </div>
            {selectedOrder ? (
              <div className="qr-review-card">
                <div className="qr-review-head">
                  <div>
                    <strong>{readQrOrderLabel(selectedOrder)}</strong>
                    <span>{readRelativeTime(selectedOrder.createdAt)}</span>
                  </div>
                  <Badge tone="info">{formatMoney(selectedOrder.totalCents)}</Badge>
                </div>
                <div className="qr-review-items">
                  {selectedOrder.items.map((item) => {
                    const draft = drafts[item.id] ?? {
                      quantity: String(Number(item.quantity)),
                      notes: item.notes ?? "",
                    };
                    return (
                      <div className="qr-review-item" key={item.id}>
                        <div>
                          <strong>{item.nameSnapshot}</strong>
                          <span>{formatMoney(item.totalCents)}</span>
                        </div>
                        <label>
                          Qtd.
                          <input
                            inputMode="decimal"
                            value={draft.quantity}
                            onChange={(event) =>
                              onDraftsChange((current) => ({
                                ...current,
                                [item.id]: { ...draft, quantity: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="qr-note-field">
                          Observação
                          <input
                            value={draft.notes}
                            onChange={(event) =>
                              onDraftsChange((current) => ({
                                ...current,
                                [item.id]: { ...draft, notes: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <div className="qr-item-actions">
                          <button
                            className="button secondary compact"
                            type="button"
                            disabled={!isApiReady || isBusy}
                            onClick={() => onUpdateItem(selectedOrder, item.id)}
                          >
                            Salvar
                          </button>
                          <button
                            className="button ghost compact"
                            type="button"
                            disabled={!isApiReady || isBusy}
                            onClick={() => onCancelItem(selectedOrder, item.id)}
                          >
                            Cancelar item
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="qr-reject-field">
                  Motivo da recusa
                  <input
                    value={rejectReason}
                    onChange={(event) => onRejectReasonChange(event.target.value)}
                  />
                </label>
                <div className="ticket-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!isApiReady || isBusy}
                    onClick={() => onRejectOrder(selectedOrder)}
                  >
                    Recusar
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!isApiReady || isBusy}
                    onClick={() => onSendToKitchen(selectedOrder)}
                  >
                    <ChefHat size={16} />
                    Enviar KDS
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <strong>Nenhum pedido QR aguardando</strong>
            <span>Quando o cliente enviar pelo QR, ele aparece aqui para conferência.</span>
          </div>
        )}
      </div>
    </article>
  );
}
