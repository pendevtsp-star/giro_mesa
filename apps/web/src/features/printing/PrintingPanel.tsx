import {
  ClipboardList,
  Copy,
  FileText,
  KeyRound,
  Printer,
  ReceiptText,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  KdsStation,
  PrinterConnectorConfig,
  PrinterDevice,
  PrintJob,
  PrintRoute,
} from "../../lib/giromesa-api";

type PrinterForm = {
  name: string;
  role: string;
  connectionType: string;
  address: string;
  port: string;
  paperWidth: string;
  charactersPerLine: string;
  codepage: string;
  cutMode: string;
  boldHeader: boolean;
  beep: boolean;
  openDrawer: boolean;
};

type PrintRouteForm = {
  name: string;
  targetType: string;
  stationId: string;
  printerDeviceId: string;
  copies: string;
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

export function PrintingPanel({
  printerDevices,
  printRoutes,
  printJobs,
  kdsStations,
  printerConnectorConfig,
  generatedPrinterConnectorKey,
  printerForm,
  printRouteForm,
  isBusy,
  branchId,
  hasCurrentOrder,
  onPrinterFormChange,
  onPrintRouteFormChange,
  onCreatePrinterDevice,
  onCreatePrintRoute,
  onCopyConnectorKey,
  onConfigureConnector,
  onRevokeConnector,
  onPrintBillPreview,
  onExportBillDocument,
  onRetryPrint,
  onReprint,
  readPrintBadgeTone,
  readPrintSummary,
  readPrintKind,
  readPrintTone,
  readPrintStatus,
  readConnectorLastSeen,
  readConnectorHeartbeatValue,
}: {
  printerDevices: PrinterDevice[];
  printRoutes: PrintRoute[];
  printJobs: PrintJob[];
  kdsStations: KdsStation[];
  printerConnectorConfig: PrinterConnectorConfig;
  generatedPrinterConnectorKey: string | null;
  printerForm: PrinterForm;
  printRouteForm: PrintRouteForm;
  isBusy: boolean;
  branchId: string | undefined;
  hasCurrentOrder: boolean;
  onPrinterFormChange: (updater: (current: PrinterForm) => PrinterForm) => void;
  onPrintRouteFormChange: (updater: (current: PrintRouteForm) => PrintRouteForm) => void;
  onCreatePrinterDevice: () => void;
  onCreatePrintRoute: () => void;
  onCopyConnectorKey: () => void;
  onConfigureConnector: (rotateKey: boolean) => void;
  onRevokeConnector: () => void;
  onPrintBillPreview: () => void;
  onExportBillDocument: () => void;
  onRetryPrint: (jobId: string) => void;
  onReprint: (jobId: string) => void;
  readPrintBadgeTone: (jobs: PrintJob[]) => "neutral" | "good" | "warn" | "danger" | "info";
  readPrintSummary: (jobs: PrintJob[]) => string;
  readPrintKind: (kind: string) => string;
  readPrintTone: (status: string) => "neutral" | "good" | "warn" | "danger" | "info";
  readPrintStatus: (status: string) => string;
  readConnectorLastSeen: (value?: string | null) => string;
  readConnectorHeartbeatValue: (config: PrinterConnectorConfig, key: string) => string;
}) {
  const firstPrintJob = printJobs[0];

  return (
    <article className="panel print-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Impressão</span>
          <h2>Comandas térmicas</h2>
        </div>
        <Badge tone={readPrintBadgeTone(printJobs)}>{readPrintSummary(printJobs)}</Badge>
      </div>
      <div className="integration-list">
        <div>
          <span>Impressoras ativas</span>
          <strong>{printerDevices.filter((device) => device.isActive).length}</strong>
        </div>
        <div>
          <span>Rotas configuradas</span>
          <strong>{printRoutes.filter((route) => route.isActive).length}</strong>
        </div>
        <div>
          <span>Conector local</span>
          <strong>
            {printerConnectorConfig.hasApiKey
              ? `${printerConnectorConfig.online ? "online" : "offline"} ${
                  printerConnectorConfig.apiKeyLastFour
                }`
              : "sem token"}
          </strong>
        </div>
        <div>
          <span>Última conexão</span>
          <strong>{readConnectorLastSeen(printerConnectorConfig.lastSyncAt)}</strong>
        </div>
        <div>
          <span>Versão</span>
          <strong>{readConnectorHeartbeatValue(printerConnectorConfig, "version")}</strong>
        </div>
        <div>
          <span>Host</span>
          <strong>{readConnectorHeartbeatValue(printerConnectorConfig, "hostname")}</strong>
        </div>
      </div>
      {generatedPrinterConnectorKey ? (
        <div className="secret-box">
          <span>Token exibido uma única vez</span>
          <code>{generatedPrinterConnectorKey}</code>
          <button className="icon-button" type="button" onClick={onCopyConnectorKey}>
            <Copy size={16} />
          </button>
        </div>
      ) : null}
      <div className="hardware-forms">
        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreatePrinterDevice();
          }}
        >
          <strong>Nova impressora</strong>
          <label>
            Nome
            <input
              value={printerForm.name}
              onChange={(event) =>
                onPrinterFormChange((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <div className="form-grid-compact">
            <label>
              Função
              <select
                value={printerForm.role}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, role: event.target.value }))
                }
              >
                <option value="kitchen">Cozinha</option>
                <option value="bar">Bar</option>
                <option value="cashier">Caixa</option>
                <option value="conference">Conferência</option>
                <option value="fiscal">Fiscal</option>
              </select>
            </label>
            <label>
              Papel
              <select
                value={printerForm.paperWidth}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({
                    ...current,
                    paperWidth: event.target.value,
                    charactersPerLine: event.target.value === "58" ? "32" : "48",
                  }))
                }
              >
                <option value="80">80mm</option>
                <option value="58">58mm</option>
              </select>
            </label>
          </div>
          <div className="form-grid-compact">
            <label>
              IP/host
              <input
                value={printerForm.address}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, address: event.target.value }))
                }
              />
            </label>
            <label>
              Porta
              <input
                inputMode="numeric"
                value={printerForm.port}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, port: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="form-grid-compact">
            <label>
              Codepage
              <select
                value={printerForm.codepage}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, codepage: event.target.value }))
                }
              >
                <option value="cp850">CP850</option>
                <option value="cp860">CP860</option>
                <option value="cp1252">Windows-1252</option>
              </select>
            </label>
            <label>
              Corte
              <select
                value={printerForm.cutMode}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, cutMode: event.target.value }))
                }
              >
                <option value="partial">Parcial</option>
                <option value="full">Total</option>
              </select>
            </label>
          </div>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={printerForm.boldHeader}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({
                    ...current,
                    boldHeader: event.target.checked,
                  }))
                }
              />
              Cabeçalho em negrito
            </label>
            <label>
              <input
                type="checkbox"
                checked={printerForm.beep}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({ ...current, beep: event.target.checked }))
                }
              />
              Beep
            </label>
            <label>
              <input
                type="checkbox"
                checked={printerForm.openDrawer}
                onChange={(event) =>
                  onPrinterFormChange((current) => ({
                    ...current,
                    openDrawer: event.target.checked,
                  }))
                }
              />
              Gaveta
            </label>
          </div>
          <button className="button secondary full" type="submit" disabled={isBusy}>
            <Printer size={17} /> Cadastrar impressora
          </button>
        </form>

        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreatePrintRoute();
          }}
        >
          <strong>Nova rota</strong>
          <label>
            Nome
            <input
              value={printRouteForm.name}
              onChange={(event) =>
                onPrintRouteFormChange((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            Estação KDS
            <select
              value={printRouteForm.stationId}
              onChange={(event) =>
                onPrintRouteFormChange((current) => ({
                  ...current,
                  stationId: event.target.value,
                }))
              }
            >
              <option value="">Todas</option>
              {kdsStations.map((station) => (
                <option value={station.id} key={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Impressora
            <select
              value={printRouteForm.printerDeviceId}
              onChange={(event) =>
                onPrintRouteFormChange((current) => ({
                  ...current,
                  printerDeviceId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {printerDevices.map((device) => (
                <option value={device.id} key={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid-compact">
            <label>
              Tipo
              <select
                value={printRouteForm.targetType}
                onChange={(event) =>
                  onPrintRouteFormChange((current) => ({
                    ...current,
                    targetType: event.target.value,
                  }))
                }
              >
                <option value="kitchen_ticket">Cozinha</option>
                <option value="bar_ticket">Bar</option>
                <option value="bill_preview">Conferência</option>
                <option value="cash_summary">Caixa</option>
                <option value="payment_receipt">Comprovante</option>
              </select>
            </label>
            <label>
              Vias
              <input
                inputMode="numeric"
                value={printRouteForm.copies}
                onChange={(event) =>
                  onPrintRouteFormChange((current) => ({
                    ...current,
                    copies: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="button secondary full" type="submit" disabled={isBusy}>
            <ClipboardList size={17} /> Cadastrar rota
          </button>
        </form>
      </div>
      <div className="status-list">
        {printJobs.slice(0, 3).map((job) => (
          <div className="status-row rich" key={job.id}>
            <div>
              <strong>{job.printerName ?? "Sem impressora"}</strong>
              <span>
                {readPrintKind(job.kind)} - {job.orderId?.slice(0, 8) ?? "sem pedido"}
              </span>
            </div>
            <Badge tone={readPrintTone(job.status)}>{readPrintStatus(job.status)}</Badge>
            <small>{job.copies} via(s)</small>
          </div>
        ))}
      </div>
      <div className="ticket-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() => onConfigureConnector(false)}
          disabled={isBusy || !branchId}
        >
          <KeyRound size={17} /> Token
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => onConfigureConnector(true)}
          disabled={isBusy || !branchId}
        >
          <RotateCw size={17} /> Rotacionar
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={onRevokeConnector}
          disabled={isBusy || !printerConnectorConfig.hasApiKey}
        >
          <ShieldCheck size={17} /> Revogar
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={onPrintBillPreview}
          disabled={isBusy || !hasCurrentOrder}
        >
          <ReceiptText size={17} /> Pré-conta
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={onExportBillDocument}
          disabled={isBusy || !hasCurrentOrder}
        >
          <FileText size={17} /> Pré-conta PDF
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => firstPrintJob && onRetryPrint(firstPrintJob.id)}
          disabled={
            isBusy || !firstPrintJob || !["failed", "canceled"].includes(firstPrintJob.status)
          }
        >
          <RotateCw size={17} /> Tentar novamente
        </button>
        <button
          className="button primary"
          type="button"
          onClick={() => firstPrintJob && onReprint(firstPrintJob.id)}
          disabled={isBusy || !firstPrintJob}
        >
          <Printer size={17} /> Reimprimir
        </button>
      </div>
    </article>
  );
}
