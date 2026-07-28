"use client";

import { KeyRound, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

export function ApprovalPinDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  busy = false,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (managerPin: string, reason: string) => Promise<void> | void;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setPin("");
      setReason("");
    }
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length < 4) return;
    void onConfirm(pin, reason);
  }

  return (
    <div className="approval-dialog-backdrop">
      <button
        className="approval-dialog-dismiss"
        type="button"
        aria-label="Fechar aprovação"
        onClick={onClose}
      />
      <section
        className="approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-dialog-title"
      >
        <button
          className="approval-dialog-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <span className="section-kicker">
          <KeyRound size={15} /> Aprovação gerencial
        </span>
        <h2 id="approval-dialog-title">{title}</h2>
        <p className="muted-copy">{description}</p>
        <form className="settings-form" onSubmit={submit}>
          <label>
            PIN do gerente
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              autoComplete="off"
              required
            />
          </label>
          <label>
            Observação da decisão
            <textarea
              maxLength={240}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Opcional"
            />
          </label>
          {error ? (
            <p className="danger-text" role="alert">
              {error}
            </p>
          ) : null}
          <div className="toolbar">
            <button className="button ghost" type="button" onClick={onClose} disabled={busy}>
              Voltar
            </button>
            <button className="button primary" type="submit" disabled={busy || pin.length < 4}>
              {busy ? "Validando..." : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
