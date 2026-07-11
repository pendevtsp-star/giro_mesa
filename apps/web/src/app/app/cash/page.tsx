"use client";

import { Banknote, LockKeyhole, Printer, Unlock } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  closeCashSession,
  formatMoney,
  getCashSessionSummary,
  getSession,
  openCashSession,
  printCashSessionSummary,
  type CashSessionSummary,
} from "../../../lib/giromesa-api";

const cents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);

export default function CashPage() {
  const [branchId, setBranchId] = useState("");
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [opening, setOpening] = useState("0,00");
  const [counted, setCounted] = useState("");
  const [message, setMessage] = useState("Carregando caixa...");
  const [busy, setBusy] = useState(false);
  async function refresh(id = branchId) { if (!id) return; try { const data = await getCashSessionSummary(id); setSummary(data); setMessage(data.session ? "Caixa aberto para operação." : "Não há caixa aberto nesta unidade."); } catch { setMessage("Entre com uma conta de caixa ou gestão para continuar."); } }
  useEffect(() => { void (async () => { try { const session = await getSession(); if (!session.branchId) throw new Error(); setBranchId(session.branchId); await refresh(session.branchId); } catch { setMessage("Entre com uma conta de caixa ou gestão para continuar."); } })(); }, []);
  async function open(event: FormEvent) { event.preventDefault(); setBusy(true); try { await openCashSession(branchId, cents(opening)); await refresh(); setMessage("Caixa aberto e auditado."); } catch { setMessage("Não foi possível abrir o caixa."); } finally { setBusy(false); } }
  async function close(event: FormEvent) { event.preventDefault(); if (!summary?.session) return; setBusy(true); try { await closeCashSession(summary.session.id, cents(counted)); await refresh(); setMessage("Fechamento registrado."); } catch { setMessage("Não foi possível fechar o caixa. Confira pedidos pendentes."); } finally { setBusy(false); } }
  return <main className="workspace-page"><header className="workspace-topbar"><a className="brand" href="/app"><span className="brand-mark">G</span><span>GiroMesa</span></a><a className="button secondary" href="/app/reports">Relatórios</a></header><section className="workspace-heading"><span className="section-kicker"><Banknote size={16} /> Financeiro operacional</span><h1>Caixa</h1><p>{message}</p></section><section className="cash-layout"><article className="workspace-panel"><div className="panel-heading"><div><span className="section-kicker">Sessão atual</span><h2>{summary?.session ? "Caixa em operação" : "Abrir caixa"}</h2></div>{summary?.session ? <span className="count-chip">Aberto</span> : null}</div>{summary?.session ? <div className="cash-figures"><div><span>Fundo inicial</span><strong>{formatMoney(summary.session.openingAmountCents)}</strong></div><div><span>Previsto</span><strong>{formatMoney(summary.session.expectedAmountCents)}</strong></div><div><span>Pagamentos</span><strong>{summary.payments.count}</strong></div></div> : <form className="workspace-form" onSubmit={open}><label>Valor de abertura<input inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} /></label><button className="button primary" disabled={busy || !branchId} type="submit"><Unlock size={16} /> Abrir caixa</button></form>}</article><article className="workspace-panel"><div className="panel-heading"><div><span className="section-kicker"><LockKeyhole size={15} /> Conferência</span><h2>Fechamento</h2></div></div>{summary?.session ? <form className="workspace-form" onSubmit={close}><label>Valor contado<input inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder="0,00" /></label><div className="cash-expected">Esperado: <strong>{formatMoney(summary.session.expectedAmountCents)}</strong></div><button className="button primary" disabled={busy || !counted} type="submit"><LockKeyhole size={16} /> Fechar caixa</button><button className="button secondary" onClick={() => void printCashSessionSummary(summary.session!.id).then(() => setMessage("Resumo enviado para a fila de impressão.")).catch(() => setMessage("Não foi possível enfileirar a impressão."))} type="button"><Printer size={16} /> Imprimir resumo</button></form> : <p className="muted-copy">Abra uma sessão para que os pagamentos presenciais sejam conciliados aqui.</p>}</article></section><section className="workspace-list-section"><div className="panel-heading"><div><span className="section-kicker">Recebimentos</span><h2>Formas de pagamento</h2></div></div>{summary?.payments.mix?.map((item) => <div className="inventory-row" key={item.method}><span>{item.method}</span><strong>{formatMoney(item.totalCents)}</strong></div>)}{!summary?.payments.mix?.length ? <p className="muted-copy">Nenhum recebimento na sessão atual.</p> : null}</section></main>;
}
