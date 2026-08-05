"use client";

import { Dialog } from "@giromesa/ui";
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, Scale } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getSession,
  importPaymentReconciliation,
  listPaymentReconciliationEntries,
  matchPaymentReconciliation,
  type PaymentReconciliationEntry,
  resolvePaymentReconciliation,
} from "../../../../lib/giromesa-api";
import styles from "../../fiscal/fiscal.module.css";

type Filter = "all" | PaymentReconciliationEntry["status"];

export default function PaymentReconciliationPage() {
  const [branchId, setBranchId] = useState("");
  const [entries, setEntries] = useState<PaymentReconciliationEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("Carregando a conferência...");
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<{
    entry: PaymentReconciliationEntry;
    resolution: "accepted" | "ignored" | "chargeback";
    reason: string;
    paymentId: string;
  } | null>(null);

  const refresh = useCallback(async (activeBranchId: string, activeFilter: Filter = "all") => {
    const rows = await listPaymentReconciliationEntries(
      activeBranchId,
      activeFilter === "all" ? undefined : activeFilter,
    );
    setEntries(rows);
    setNotice("Conferência atualizada.");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setNotice("Entre com uma conta autorizada para conferir recebimentos.");
      }
    })();
  }, [refresh]);

  const summary = useMemo(
    () => ({
      matched: entries.filter((entry) => entry.status === "matched").length,
      attention: entries.filter((entry) => ["unmatched", "divergent"].includes(entry.status))
        .length,
      resolved: entries.filter((entry) => entry.status === "resolved").length,
    }),
    [entries],
  );

  async function safeRefresh(nextFilter = filter) {
    if (!branchId) return;
    setBusy(true);
    try {
      await refresh(branchId, nextFilter);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível atualizar a conferência.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("O CSV deve ter no máximo 2 MB para proteger o terminal de operação.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const result = await importPaymentReconciliation({
        branchId,
        csv: await file.text(),
        source: "upload_operador",
      });
      await refresh(branchId, filter);
      setNotice(
        result.duplicate
          ? "Este arquivo já havia sido importado; nenhum dado foi duplicado."
          : `Importação concluída: ${result.summary.matched} conferidos, ${result.summary.divergent + result.summary.unmatched} para analisar.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Arquivo inválido ou incompatível.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function completeAnalysis() {
    if (!analysis || analysis.reason.trim().length < 3) return;
    if (
      analysis.resolution === "chargeback" &&
      !window.confirm(
        "Confirmar o chargeback? O lançamento original será preservado e uma ocorrência compensatória será registrada.",
      )
    )
      return;
    setBusy(true);
    try {
      if (analysis.paymentId.trim()) {
        await matchPaymentReconciliation(analysis.entry.id, {
          paymentId: analysis.paymentId.trim(),
          expectedVersion: analysis.entry.version,
          reason: analysis.reason,
        });
      } else {
        await resolvePaymentReconciliation(analysis.entry.id, {
          expectedVersion: analysis.entry.version,
          resolution: analysis.resolution,
          reason: analysis.reason,
        });
      }
      setAnalysis(null);
      await refresh(branchId, filter);
      setNotice("Análise registrada com trilha de auditoria.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir a análise.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>
            <Scale size={16} /> Conferência de recebimentos
          </span>
          <h1>Compare o sistema com o extrato</h1>
          <p>Importe um CSV, revise somente as divergências e preserve o histórico original.</p>
        </div>
        <button
          className={styles.secondary}
          disabled={!branchId || busy}
          onClick={() => void safeRefresh()}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <div className={styles.notice} role="status">
        {notice}
      </div>
      <section className={styles.progress}>
        <article className={styles.done}>
          <span>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <strong>{summary.matched}</strong>
            <small>Conferidos automaticamente</small>
          </div>
        </article>
        <article>
          <span>
            <AlertTriangle size={18} />
          </span>
          <div>
            <strong>{summary.attention}</strong>
            <small>Precisam de análise</small>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <strong>{summary.resolved}</strong>
            <small>Resolvidos pela gestão</small>
          </div>
        </article>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <div>
            <span className={styles.kicker}>Importar arquivo</span>
            <h2>CSV de conciliação</h2>
            <p>
              Colunas obrigatórias: external_key, gross_cents, fee_cents e net_cents. Limite: 2 MB.
            </p>
          </div>
          <FileUp size={24} />
        </div>
        <label htmlFor="reconciliation-csv">Selecionar CSV</label>
        <input
          accept=".csv,text/csv"
          disabled={busy || !branchId}
          id="reconciliation-csv"
          onChange={(event) => void importFile(event)}
          type="file"
        />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <div>
            <span className={styles.kicker}>Análise</span>
            <h2>Lançamentos importados</h2>
          </div>
          <label>
            Filtro
            <select
              value={filter}
              onChange={(event) => {
                const next = event.target.value as Filter;
                setFilter(next);
                void safeRefresh(next);
              }}
            >
              <option value="all">Todos</option>
              <option value="unmatched">Sem correspondência</option>
              <option value="divergent">Divergentes</option>
              <option value="matched">Conferidos</option>
              <option value="resolved">Resolvidos</option>
            </select>
          </label>
        </div>
        <div className={styles.list}>
          {entries.length ? (
            entries.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>
                    {money(entry.grossCents)} · {entry.externalKey}
                  </strong>
                  <small>
                    {statusLabel(entry.status)} · líquido {money(entry.netCents)} · tarifa{" "}
                    {money(entry.feeCents)}
                  </small>
                  <small>
                    NSU {entry.nsu ?? "não informado"} · autorização{" "}
                    {entry.authorizationCode ?? "não informada"} ·{" "}
                    {entry.settledAt
                      ? new Date(entry.settledAt).toLocaleString("pt-BR")
                      : "data não informada"}
                  </small>
                  <small>
                    Pagamento {entry.paymentId?.slice(0, 8) ?? "não associado"} · referência{" "}
                    {entry.providerReference ?? "não informada"}
                  </small>
                </div>
                {["unmatched", "divergent"].includes(entry.status) ? (
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() =>
                      setAnalysis({ entry, resolution: "accepted", reason: "", paymentId: "" })
                    }
                    type="button"
                  >
                    Analisar
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p className={styles.empty}>Nenhum lançamento neste filtro.</p>
          )}
        </div>
      </section>
      {analysis ? (
        <Dialog
          className={styles.panel ?? ""}
          dismissible={!busy}
          onClose={() => setAnalysis(null)}
          open
          title={`Analisar ${analysis.entry.externalKey}`}
        >
          <p>
            Associe ao pagamento correto ou registre uma resolução gerencial. O registro importado
            nunca será alterado.
          </p>
          <div className={styles.formGrid}>
            <label>
              Pagamento GiroMesa (UUID, opcional)
              <input
                onChange={(event) => setAnalysis({ ...analysis, paymentId: event.target.value })}
                value={analysis.paymentId}
              />
            </label>
            <label>
              Decisão
              <select
                disabled={Boolean(analysis.paymentId)}
                onChange={(event) =>
                  setAnalysis({
                    ...analysis,
                    resolution: event.target.value as typeof analysis.resolution,
                  })
                }
                value={analysis.resolution}
              >
                <option value="accepted">Aceitar conferência</option>
                <option value="ignored">Ignorar com justificativa</option>
                <option value="chargeback">Registrar chargeback</option>
              </select>
            </label>
          </div>
          <label>
            Justificativa
            <input
              data-dialog-initial-focus
              onChange={(event) => setAnalysis({ ...analysis, reason: event.target.value })}
              value={analysis.reason}
            />
          </label>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => setAnalysis(null)}
              type="button"
            >
              Voltar
            </button>
            <button
              className={analysis.resolution === "chargeback" ? styles.danger : styles.primary}
              disabled={busy || analysis.reason.trim().length < 3}
              onClick={() => void completeAnalysis()}
              type="button"
            >
              Confirmar análise
            </button>
          </div>
        </Dialog>
      ) : null}
      <p className={styles.help}>
        A importação é append-only e protegida por checksum. Conciliação automática permanece
        bloqueada até a escolha do adquirente e do contrato comercial.
      </p>
    </main>
  );
}

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabel = (status: string) =>
  (
    ({
      matched: "Conferido",
      unmatched: "Sem correspondência",
      divergent: "Divergente",
      resolved: "Resolvido",
    }) as Record<string, string>
  )[status] ?? status;
