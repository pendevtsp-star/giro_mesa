"use client";

import { Printer, RefreshCw, Route, Server } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getSession,
  listPrintJobs,
  listPrintRoutes,
  listPrinterDevices,
  reprintPrintJob,
  retryPrintJob,
  type PrintJob,
  type PrintRoute,
  type PrinterDevice,
} from "../../../lib/giromesa-api";

export default function PrintingPage() {
  const [branchId, setBranchId] = useState("");
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [routes, setRoutes] = useState<PrintRoute[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [message, setMessage] = useState("Carregando estrutura de impressão...");

  async function load(id = branchId) {
    try {
      const [deviceRows, routeRows, jobRows] = await Promise.all([
        listPrinterDevices(id),
        listPrintRoutes(id),
        listPrintJobs(id),
      ]);
      setDevices(deviceRows);
      setRoutes(routeRows);
      setJobs(jobRows);
      setMessage(`${deviceRows.length} impressora(s), ${routeRows.length} rota(s) e ${jobRows.length} trabalho(s).`);
    } catch {
      setMessage("Entre com um perfil autorizado para administrar a impressão.");
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error("Unidade não encontrada");
        setBranchId(session.branchId);
        await load(session.branchId);
      } catch {
        setMessage("Entre com um perfil autorizado para administrar a impressão.");
      }
    })();
  }, []);

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app"><span className="brand-mark">G</span><span>GiroMesa</span></a>
        <button className="button secondary" onClick={() => void load()} type="button"><RefreshCw size={16} /> Atualizar</button>
      </header>
      <section className="workspace-heading"><span className="section-kicker"><Printer size={16} /> Hardware</span><h1>Impressão</h1><p>{message}</p></section>
      <section className="printing-metrics">
        <article><Server size={18} /><strong>{devices.filter((item) => item.isActive).length}</strong><span>impressoras ativas</span></article>
        <article><Route size={18} /><strong>{routes.length}</strong><span>rotas configuradas</span></article>
        <article><Printer size={18} /><strong>{jobs.filter((item) => item.status === "failed").length}</strong><span>falhas na fila</span></article>
      </section>
      <section className="printing-grid">
        <article className="workspace-list-section"><div className="panel-heading"><div><span className="section-kicker">Dispositivos</span><h2>Impressoras</h2></div></div>{devices.map((device) => <div className="inventory-row" key={device.id}><div><strong>{device.name}</strong><small>{device.role} · {device.connectionType}{device.address ? ` · ${device.address}` : ""}</small></div><span className={device.isActive ? "count-chip" : "muted-copy"}>{device.isActive ? "Ativa" : "Inativa"}</span></div>)}</article>
        <article className="workspace-list-section"><div className="panel-heading"><div><span className="section-kicker">Automação</span><h2>Rotas</h2></div></div>{routes.map((route) => <div className="inventory-row" key={route.id}><div><strong>{route.name}</strong><small>{route.trigger} → {route.targetType}</small></div><span className="count-chip">{route.copies} cópia(s)</span></div>)}</article>
      </section>
      <section className="workspace-list-section"><div className="panel-heading"><div><span className="section-kicker">Fila</span><h2>Últimos trabalhos</h2></div></div>{jobs.slice(0, 12).map((job) => <div className="print-job-row" key={job.id}><div><strong>{job.kind}</strong><small>{job.status} · {new Date(job.createdAt).toLocaleString("pt-BR")}</small></div><div>{job.status === "failed" ? <button className="button secondary compact" onClick={() => void retryPrintJob(job.id).then(() => load())} type="button">Tentar novamente</button> : null}<button className="button secondary compact" onClick={() => void reprintPrintJob(job.id, "Reimpressão solicitada no painel").then(() => load())} type="button">Reimprimir</button></div></div>)}{!jobs.length ? <p className="muted-copy">Nenhum trabalho na fila.</p> : null}</section>
    </main>
  );
}
