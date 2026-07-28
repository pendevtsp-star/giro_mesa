"use client";

import {
  Download,
  ExternalLink,
  Palette,
  Printer,
  QrCode,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createQrArtwork,
  getErrorMessage,
  getQrSettings,
  listQrTables,
  type QrAdminTable,
  type QrArtwork,
  type QrBranchSettings,
  type QrCapability,
  rotateQrTable,
  updateQrSettings,
} from "../../../lib/giromesa-api";

const capabilityLabels: Record<QrCapability, string> = {
  menu: "Ver cardápio",
  order: "Fazer pedido",
  review_before_kds: "Revisar antes do KDS",
  track_preparation: "Acompanhar preparo",
  view_tab: "Ver comanda",
  call_waiter: "Chamar garçom",
  request_pre_bill: "Solicitar pré-conta",
};

export default function QrManagementPage() {
  const [settings, setSettings] = useState<QrBranchSettings | null>(null);
  const [tables, setTables] = useState<QrAdminTable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [artwork, setArtwork] = useState<QrArtwork | null>(null);
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [size, setSize] = useState<"plate_10x15" | "sticker_8x8" | "a4">("plate_10x15");
  const [message, setMessage] = useState("Carregando configuração de QR...");
  const [busy, setBusy] = useState(false);

  const allSelected = tables.length > 0 && selected.size === tables.length;
  async function load() {
    setBusy(true);
    try {
      const [nextSettings, nextTables] = await Promise.all([getQrSettings(), listQrTables()]);
      setSettings(nextSettings);
      setTables(nextTables);
      setSelected((current) => {
        const valid = new Set(
          nextTables.filter((table) => current.has(table.id)).map((table) => table.id),
        );
        return valid.size > 0 ? valid : new Set(nextTables.map((table) => table.id));
      });
      setMessage(`${nextTables.length} mesa(s) disponível(is) para gerar material.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Não foi possível carregar os QR codes."));
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: bootstrap único; recargas seguintes são explícitas.
  useEffect(() => {
    void load();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      const updated = await updateQrSettings({
        capabilities: settings.capabilities,
        reviewBeforeKds: settings.reviewBeforeKds,
        template: settings.template,
        primaryColor: settings.primaryColor,
        instruction: settings.instruction,
        showLogo: settings.showLogo,
      });
      setSettings(updated);
      setMessage("Política e identidade dos QR codes salvas.");
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao salvar a configuração."));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (selected.size === 0) {
      setMessage("Selecione pelo menos uma mesa.");
      return;
    }
    setBusy(true);
    try {
      const result = await createQrArtwork({ tableIds: [...selected], format, size });
      setArtwork(result);
      setMessage(`${result.items.length} material(is) gerado(s) com quiet zone e correção alta.`);
      if (format === "pdf" && result.printHtml) {
        printHtml(result.printHtml);
      }
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao gerar os materiais."));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(table: QrAdminTable) {
    if (
      !window.confirm(
        `Rotacionar o QR da ${table.name}? O material impresso anteriormente deixará de funcionar imediatamente.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await rotateQrTable(table.id);
      setArtwork(null);
      await load();
      setMessage(`QR da ${table.name} rotacionado e material anterior invalidado.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao rotacionar o QR."));
    } finally {
      setBusy(false);
    }
  }

  function toggleCapability(capability: QrCapability) {
    if (!settings) return;
    const enabled = settings.capabilities.includes(capability);
    const capabilities = enabled
      ? settings.capabilities.filter((item) => item !== capability)
      : [...settings.capabilities, capability];
    if (capabilities.length === 0) return;
    setSettings({ ...settings, capabilities });
  }

  return (
    <main className="workspace-page qr-admin-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <section className="workspace-heading qr-heading">
        <div>
          <span className="section-kicker">
            <QrCode size={16} /> Atendimento digital
          </span>
          <h1>QR personalizado por mesa</h1>
          <p>Configure recursos, gere lotes prontos para impressão e revogue materiais antigos.</p>
        </div>
        <span className="qr-security-chip">Token assinado e revogável</span>
      </section>

      <p className="workspace-message" role="status">
        {message}
      </p>

      {settings ? (
        <section className="qr-admin-grid">
          <article className="workspace-list-section qr-settings-card">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <Palette size={15} /> Modelo
                </span>
                <h2>Identidade e política</h2>
              </div>
            </div>

            <div className="form-grid two-columns">
              <label>
                Modelo visual
                <select
                  value={settings.template}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      template: event.target.value as QrBranchSettings["template"],
                    })
                  }
                >
                  <option value="classic">Clássico</option>
                  <option value="minimal">Minimalista</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              <label>
                Cor principal
                <input
                  aria-label="Cor principal"
                  onChange={(event) =>
                    setSettings({ ...settings, primaryColor: event.target.value })
                  }
                  type="color"
                  value={settings.primaryColor}
                />
              </label>
            </div>
            <label>
              Instrução impressa
              <input
                maxLength={180}
                onChange={(event) => setSettings({ ...settings, instruction: event.target.value })}
                value={settings.instruction}
              />
            </label>

            <fieldset className="qr-capabilities">
              <legend>Recursos disponíveis ao cliente</legend>
              {Object.entries(capabilityLabels).map(([value, label]) => (
                <label key={value}>
                  <input
                    checked={settings.capabilities.includes(value as QrCapability)}
                    onChange={() => toggleCapability(value as QrCapability)}
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className="qr-switch-row">
              <input
                checked={settings.reviewBeforeKds}
                onChange={(event) =>
                  setSettings({ ...settings, reviewBeforeKds: event.target.checked })
                }
                type="checkbox"
              />
              <span>Equipe revisa pedidos QR antes de enviar ao KDS</span>
            </label>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveSettings()}
              type="button"
            >
              Salvar configuração
            </button>
          </article>

          <article className="workspace-list-section qr-generation-card">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <Printer size={15} /> Saída
                </span>
                <h2>Gerar material</h2>
              </div>
            </div>
            <div className="form-grid two-columns">
              <label>
                Formato
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                >
                  <option value="svg">SVG vetorial</option>
                  <option value="png">PNG 1024 px</option>
                  <option value="pdf">Imprimir / salvar PDF</option>
                </select>
              </label>
              <label>
                Tamanho
                <select
                  value={size}
                  onChange={(event) => setSize(event.target.value as typeof size)}
                >
                  <option value="plate_10x15">Placa 10 × 15 cm</option>
                  <option value="sticker_8x8">Adesivo 8 × 8 cm</option>
                  <option value="a4">Folha A4</option>
                </select>
              </label>
            </div>
            <div className="qr-generation-summary">
              <strong>{selected.size}</strong>
              <span>mesa(s) selecionada(s)</span>
            </div>
            <button
              className="button primary"
              disabled={busy || selected.size === 0}
              onClick={() => void generate()}
              type="button"
            >
              <QrCode size={17} /> Gerar e visualizar
            </button>
            <p className="muted-copy">
              O QR usa correção alta, margem de quatro módulos e contraste validado para impressão.
            </p>
          </article>
        </section>
      ) : null}

      <section className="workspace-list-section">
        <div className="panel-heading qr-table-heading">
          <div>
            <span className="section-kicker">Mesas</span>
            <h2>Seleção e rotação</h2>
          </div>
          <label className="qr-select-all">
            <input
              checked={allSelected}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? new Set(tables.map((table) => table.id)) : new Set(),
                )
              }
              type="checkbox"
            />
            Selecionar todas
          </label>
        </div>
        <div className="qr-table-list">
          {tables.map((table) => (
            <article className="qr-table-row" key={table.id}>
              <input
                aria-label={`Selecionar ${table.name}`}
                checked={selected.has(table.id)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(table.id);
                    else next.delete(table.id);
                    return next;
                  })
                }
                type="checkbox"
              />
              <div>
                <strong>{table.code}</strong>
                <span>
                  {table.name} · {table.seats} lugares
                </span>
              </div>
              <span className="count-chip">v{table.qrTokenVersion}</span>
              <a
                className="button secondary compact"
                href={table.publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={14} /> Abrir
              </a>
              <button
                className="button secondary compact"
                disabled={busy}
                onClick={() => void rotate(table)}
                type="button"
              >
                <RotateCw size={14} /> Rotacionar
              </button>
            </article>
          ))}
          {tables.length === 0 && !busy ? (
            <p className="empty-state">Cadastre mesas no mapa do salão primeiro.</p>
          ) : null}
        </div>
      </section>

      {artwork ? (
        <section className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Prévia</span>
              <h2>Materiais gerados</h2>
            </div>
            {artwork.printHtml ? (
              <button
                className="button secondary"
                onClick={() => printHtml(artwork.printHtml ?? "")}
                type="button"
              >
                <Printer size={16} /> Imprimir / PDF
              </button>
            ) : null}
          </div>
          <div className="qr-preview-grid">
            {artwork.items.map((item) => (
              <article className="qr-preview-card" key={item.tableId}>
                <strong>{item.tableName}</strong>
                <span>{item.tableCode}</span>
                {/* biome-ignore lint/performance/noImgElement: prévia SVG gerada em runtime pelo backend. */}
                <img
                  alt={`QR da ${item.tableName}`}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`}
                />
                <p>{artwork.settings.instruction}</p>
                <button
                  className="button secondary compact"
                  onClick={() =>
                    downloadData(
                      item.fileName,
                      item.png ??
                        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`,
                    )
                  }
                  type="button"
                >
                  <Download size={14} /> Baixar
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function printHtml(html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Permita pop-ups para imprimir ou salvar o PDF.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function downloadData(fileName: string, data: string) {
  const anchor = document.createElement("a");
  anchor.href = data;
  anchor.download = fileName;
  anchor.click();
}
