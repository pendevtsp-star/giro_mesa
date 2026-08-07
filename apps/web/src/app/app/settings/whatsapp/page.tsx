"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, QrCode, ShieldOff } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import {
  configureWhatsappQr,
  getSession,
  getWhatsappQrConfig,
  revokeWhatsappQr,
  type WhatsappQrConfig,
} from "../../../../lib/giromesa-api";

export default function WhatsappSettingsPage() {
  const [branchId, setBranchId] = useState("");
  const [config, setConfig] = useState<WhatsappQrConfig | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [notice, setNotice] = useState("Carregando conexão...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSession()
      .then((session) => {
        if (!session.branchId) throw new Error("Nenhuma filial ativa na sessão.");
        setBranchId(session.branchId);
        return getWhatsappQrConfig(session.branchId);
      })
      .then(async (next) => {
        setConfig(next);
        setQrImage(next.qr ? await QRCode.toDataURL(next.qr, { margin: 2, width: 280 }) : "");
        setNotice("Conexão opcional e não oficial pronta para homologação.");
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : "Falha ao carregar conexão."),
      );
  }, []);

  async function configure(rotateKey = false) {
    if (!branchId) return;
    setBusy(true);
    try {
      const next = await configureWhatsappQr(branchId, rotateKey);
      setConfig(next);
      setQrImage("");
      setNotice(
        next.apiKeyReturnedOnce
          ? `Chave criada: ${next.apiKey}. Copie-a agora para o conector; ela não será exibida novamente.`
          : "Conector configurado sem trocar a chave.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao configurar WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!branchId || !window.confirm("Revogar esta conexão e invalidar a chave?")) return;
    setBusy(true);
    try {
      setConfig(await revokeWhatsappQr(branchId));
      setQrImage("");
      setNotice("Conexão revogada. O transporte continua desligado até nova homologação.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao revogar conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app/settings/operation">
          <ArrowLeft size={16} /> Operação
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <QrCode size={16} /> Comunicação
        </span>
        <h1>WhatsApp por QR</h1>
        <p>{notice}</p>
      </section>
      <section className="operation-settings-grid">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Conexão opcional</span>
              <h2>Status da filial</h2>
            </div>
          </div>
          <p className="muted-copy">
            O conector usa pareamento por QR e não é uma integração oficial da Meta. Ative somente
            após homologar um número dedicado.
          </p>
          <div className="settings-form">
            <p>
              <strong>Estado:</strong> {config?.connection ?? "carregando"}
            </p>
            <p>
              <strong>Telefone:</strong> {config?.phone ?? "Ainda não pareado"}
            </p>
            <p>
              <strong>Chave:</strong>{" "}
              {config?.hasApiKey ? `••••${config.apiKeyLastFour ?? ""}` : "Não configurada"}
            </p>
            <div className="button-row">
              <button
                className="button primary compact"
                type="button"
                disabled={busy || !branchId}
                onClick={() => void configure(!config?.hasApiKey)}
              >
                <CheckCircle2 size={15} /> {config?.hasApiKey ? "Reconfigurar" : "Gerar chave"}
              </button>
              {config?.hasApiKey ? (
                <button
                  className="button ghost compact"
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke()}
                >
                  <ShieldOff size={15} /> Revogar
                </button>
              ) : null}
            </div>
          </div>
        </article>
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Pareamento</span>
              <h2>Leia o QR no celular</h2>
            </div>
          </div>
          {qrImage ? (
            <Image
              src={qrImage}
              alt="QR de pareamento do WhatsApp"
              width={280}
              height={280}
              unoptimized
            />
          ) : (
            <p className="muted-copy">
              O QR aparecerá aqui quando o conector local estiver iniciado e aguardando pareamento.
            </p>
          )}
          <p className="muted-copy">
            <AlertTriangle size={14} /> Mensagens e status devem ser homologados antes de ativar o
            transporte em produção.
          </p>
        </article>
      </section>
    </main>
  );
}
