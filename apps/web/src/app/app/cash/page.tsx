"use client";

import {
  ArrowLeft,
  Banknote,
  LockKeyhole,
  MinusCircle,
  PlusCircle,
  Printer,
  Unlock,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { formatMoney, getSession, printCashSessionSummary } from "../../../lib/giromesa-api";
import { useCashSummary } from "../../../lib/hooks/useCashSummary";
import { useOperationalShift } from "../../../lib/hooks/useOperationalShift";

const cents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);

export default function CashPage() {
  const [branchId, setBranchId] = useState("");
  const shift = useOperationalShift(branchId);
  const cash = useCashSummary(branchId);
  const [opening, setOpening] = useState("0,00");
  const [counted, setCounted] = useState("");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [message, setMessage] = useState("Carregando operação financeira...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error("Unidade não encontrada");
        setBranchId(session.branchId);
        setMessage("Operação carregada.");
      } catch {
        setMessage("Entre com uma conta de caixa ou gestão para continuar.");
      }
    })();
  }, []);

  async function withBusy(action: () => Promise<void>, success: string, failure: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage(failure);
    } finally {
      setBusy(false);
    }
  }

  async function openCash(event: FormEvent) {
    event.preventDefault();
    await withBusy(
      async () => {
        await cash.open(cents(opening));
      },
      "Caixa aberto com auditoria.",
      "Não foi possível abrir o caixa.",
    );
  }

  async function closeCash(event: FormEvent) {
    event.preventDefault();
    const active = cash.data?.session;
    if (!active) return;
    await withBusy(
      async () => {
        await cash.close(active.id, cents(counted));
      },
      "Fechamento de caixa registrado.",
      "Não foi possível fechar o caixa. Confira pedidos pendentes.",
    );
  }

  async function createMovement(type: "supply" | "withdrawal") {
    await withBusy(
      async () => {
        if (type === "supply") await cash.supply(cents(movementAmount), movementReason);
        if (type === "withdrawal") await cash.withdrawal(cents(movementAmount), movementReason);
        setMovementAmount("");
        setMovementReason("");
      },
      type === "supply" ? "Suprimento registrado." : "Sangria registrada.",
      "Não foi possível registrar o movimento.",
    );
  }

  const activeShift = shift.data?.shift;
  const activeCash = cash.data?.session;
  const difference =
    activeCash && counted
      ? cents(counted) - activeCash.expectedAmountCents
      : activeCash?.differenceCents;

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Banknote size={16} /> Financeiro operacional
        </span>
        <h1>Turno e caixa</h1>
        <p>{message}</p>
      </section>

      <section className="cash-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Turno</span>
              <h2>{activeShift ? "Turno aberto" : "Abrir turno"}</h2>
            </div>
            {activeShift ? <span className="count-chip">em operação</span> : null}
          </div>
          <p className="muted-copy">
            {activeShift
              ? `Aberto em ${new Date(activeShift.openedAt).toLocaleString("pt-BR")}.`
              : "Abra o turno antes de iniciar a conferência operacional do caixa."}
          </p>
          <div className="ticket-actions">
            <button
              className="button primary"
              type="button"
              disabled={busy || !branchId || Boolean(activeShift)}
              onClick={() =>
                void withBusy(
                  async () => {
                    await shift.open("Turno iniciado pelo painel de caixa.");
                  },
                  "Turno aberto com auditoria.",
                  "Não foi possível abrir o turno.",
                )
              }
            >
              <Unlock size={16} /> Abrir turno
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy || !activeShift || Boolean(activeCash)}
              onClick={() =>
                void withBusy(
                  async () => {
                    await shift.close("Turno fechado pelo painel de caixa.");
                  },
                  "Turno fechado com auditoria.",
                  "Feche o caixa antes de encerrar o turno.",
                )
              }
            >
              <LockKeyhole size={16} /> Fechar turno
            </button>
          </div>
        </article>

        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Sessão atual</span>
              <h2>{activeCash ? "Caixa em operação" : "Abrir caixa"}</h2>
            </div>
            {activeCash ? <span className="count-chip">aberto</span> : null}
          </div>
          {activeCash ? (
            <div className="cash-figures">
              <div>
                <span>Fundo inicial</span>
                <strong>{formatMoney(activeCash.openingAmountCents)}</strong>
              </div>
              <div>
                <span>Previsto</span>
                <strong>{formatMoney(activeCash.expectedAmountCents)}</strong>
              </div>
              <div>
                <span>Pagamentos</span>
                <strong>{cash.data?.payments.count ?? 0}</strong>
              </div>
            </div>
          ) : (
            <form className="workspace-form" onSubmit={openCash}>
              <label>
                Valor de abertura
                <input
                  inputMode="decimal"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !branchId || !activeShift}
                type="submit"
              >
                <Unlock size={16} /> Abrir caixa
              </button>
            </form>
          )}
        </article>
      </section>

      <section className="cash-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Movimentações</span>
              <h2>Suprimento e sangria</h2>
            </div>
          </div>
          <div className="workspace-form">
            <label>
              Valor
              <input
                inputMode="decimal"
                value={movementAmount}
                onChange={(event) => setMovementAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label>
              Motivo
              <input
                value={movementReason}
                onChange={(event) => setMovementReason(event.target.value)}
                placeholder="Ex.: troco inicial, retirada para cofre"
              />
            </label>
            <div className="ticket-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy || !activeCash || !movementAmount || movementReason.length < 3}
                onClick={() => void createMovement("supply")}
              >
                <PlusCircle size={16} /> Suprimento
              </button>
              <button
                className="button ghost"
                type="button"
                disabled={busy || !activeCash || !movementAmount || movementReason.length < 3}
                onClick={() => void createMovement("withdrawal")}
              >
                <MinusCircle size={16} /> Sangria
              </button>
            </div>
          </div>
        </article>

        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Conferência</span>
              <h2>Fechamento do caixa</h2>
            </div>
          </div>
          {activeCash ? (
            <form className="workspace-form" onSubmit={closeCash}>
              <label>
                Valor contado
                <input
                  inputMode="decimal"
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  placeholder="0,00"
                />
              </label>
              <div className="cash-expected">
                Esperado: <strong>{formatMoney(activeCash.expectedAmountCents)}</strong>
              </div>
              <div className="cash-expected">
                Diferença: <strong>{formatMoney(difference ?? 0)}</strong>
              </div>
              <button className="button primary" disabled={busy || !counted} type="submit">
                <LockKeyhole size={16} /> Fechar caixa
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  void printCashSessionSummary(activeCash.id)
                    .then(() => setMessage("Resumo enviado para a fila de impressão."))
                    .catch(() => setMessage("Não foi possível enfileirar a impressão."));
                }}
                type="button"
              >
                <Printer size={16} /> Imprimir resumo
              </button>
            </form>
          ) : (
            <p className="muted-copy">Abra uma sessão para habilitar fechamento e impressão.</p>
          )}
        </article>
      </section>

      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Histórico recente</span>
            <h2>Movimentos do caixa</h2>
          </div>
        </div>
        {cash.data?.movements.length ? (
          cash.data.movements.map((movement) => (
            <div className="inventory-row" key={movement.id}>
              <span>
                {movement.type === "supply" ? "Suprimento" : "Sangria"} - {movement.reason}
              </span>
              <strong>{formatMoney(movement.amountCents)}</strong>
            </div>
          ))
        ) : (
          <p className="muted-copy">Nenhuma movimentação registrada na sessão atual.</p>
        )}
      </section>
    </main>
  );
}
