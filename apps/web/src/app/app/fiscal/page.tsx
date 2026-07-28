"use client";

import { FileCheck2, ReceiptText, RotateCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  cancelFiscalDocument,
  type FiscalDocument,
  getSession,
  issueFiscalDocument,
  listFiscalDocuments,
  retryFiscalDocument,
} from "../../../lib/giromesa-api";

export default function FiscalPage() {
  const [branchId, setBranchId] = useState("");
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [message, setMessage] = useState("Carregando documentos fiscais...");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (activeBranchId: string) => {
    if (!activeBranchId) return;
    try {
      const rows = await listFiscalDocuments(activeBranchId);
      setDocuments(rows);
      setMessage(`${rows.length} documento(s) fiscal(is) registrado(s).`);
    } catch {
      setMessage("Entre com uma conta autorizada para gerenciar fiscal.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setMessage("Entre com uma conta autorizada para gerenciar fiscal.");
      }
    })();
  }, [refresh]);

  async function handleIssueFiscal() {
    setBusy(true);
    try {
      const document = await issueFiscalDocument("");
      setDocuments((current) => [document, ...current]);
      setMessage(`Documento fiscal ${document.model.toUpperCase()} em fila.`);
    } catch {
      setMessage("Não foi possível emitir o documento fiscal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry(documentId: string) {
    setBusy(true);
    try {
      await retryFiscalDocument(documentId);
      await refresh(branchId);
      setMessage("Documento fiscal reenfileirado.");
    } catch {
      setMessage("Não foi possível reenfileirar o documento.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(documentId: string) {
    setBusy(true);
    try {
      await cancelFiscalDocument(documentId);
      await refresh(branchId);
      setMessage("Documento fiscal cancelado.");
    } catch {
      setMessage("Não foi possível cancelar o documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <button className="button secondary" onClick={() => void refresh(branchId)} type="button">
          <RotateCw size={16} /> Atualizar
        </button>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <FileCheck2 size={16} /> Fiscal
        </span>
        <h1>Notas e cupons</h1>
        <p>{message}</p>
      </section>
      <section className="fiscal-metrics">
        <article>
          <span>Total</span>
          <strong>{documents.length}</strong>
        </article>
        <article>
          <span>Pendentes</span>
          <strong>
            {documents.filter((d) => !["authorized", "cancelled"].includes(d.status)).length}
          </strong>
        </article>
        <article>
          <span>Autorizados</span>
          <strong>{documents.filter((d) => d.status === "authorized").length}</strong>
        </article>
      </section>
      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Documentos</span>
            <h2>Lista de documentos fiscais</h2>
          </div>
        </div>
        {documents.length > 0 ? (
          documents.map((doc) => (
            <div className="inventory-row" key={doc.id}>
              <div>
                <strong>
                  {doc.model.toUpperCase()}{" "}
                  {doc.number ? `${doc.series ?? "1"}-${doc.number}` : "pendente"}
                </strong>
                <small>
                  {doc.orderId ? `Pedido ${doc.orderId.slice(0, 8)}` : "Sem pedido"} · {doc.status}
                </small>
              </div>
              <div>
                {["pending", "rejected", "error", "contingency"].includes(doc.status) ? (
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => void handleRetry(doc.id)}
                    disabled={busy}
                  >
                    <RotateCw size={14} /> Reenfileirar
                  </button>
                ) : null}
                {doc.status === "authorized" ? (
                  <button
                    className="button ghost compact"
                    type="button"
                    onClick={() => void handleCancel(doc.id)}
                    disabled={busy}
                  >
                    <ShieldCheck size={14} /> Cancelar
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="muted-copy">Nenhum documento fiscal registrado.</p>
        )}
      </section>
      <button
        className="button primary full"
        type="button"
        onClick={() => void handleIssueFiscal()}
        disabled={busy}
      >
        <ReceiptText size={17} /> Emitir documento fiscal
      </button>
    </main>
  );
}
