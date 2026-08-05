"use client";

import { Dialog } from "@giromesa/ui";
import { KeyRound } from "lucide-react";
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length < 4) return;
    void onConfirm(pin, reason);
  }

  return (
    <Dialog
      className="approval-dialog"
      dismissible={!busy}
      onClose={onClose}
      open={open}
      title={title}
    >
      <span className="section-kicker">
        <KeyRound aria-hidden="true" size={15} /> Aprovação gerencial
      </span>
      <p className="muted-copy">{description}</p>
      <form className="settings-form" onSubmit={submit}>
        <label>
          PIN do gerente
          <input
            autoComplete="off"
            data-dialog-initial-focus
            inputMode="numeric"
            maxLength={12}
            minLength={4}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            pattern="[0-9]*"
            required
            type="password"
            value={pin}
          />
        </label>
        <label>
          Observação da decisão
          <textarea
            maxLength={240}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Opcional"
            value={reason}
          />
        </label>
        {error ? (
          <p className="danger-text" role="alert">
            {error}
          </p>
        ) : null}
        <div className="toolbar">
          <button className="button ghost" disabled={busy} onClick={onClose} type="button">
            Voltar
          </button>
          <button className="button primary" disabled={busy || pin.length < 4} type="submit">
            {busy ? "Validando..." : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
