"use client";

import { Printer, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PrintingPanel } from "../../../features/printing/PrintingPanel";
import {
  readConnectorHeartbeatValue,
  readConnectorLastSeen,
  readPrintBadgeTone,
  readPrintKind,
  readPrintStatus,
  readPrintSummary,
  readPrintTone,
} from "../../../lib/formatters/app-dashboard";
import {
  configurePrinterConnector,
  createPrinterDevice,
  createPrintRoute,
  getPrinterConnectorConfig,
  getSession,
  type KdsStation,
  listKdsStations,
  listPrinterDevices,
  listPrintJobs,
  listPrintRoutes,
  type PrinterConnectorConfig,
  type PrinterDevice,
  type PrintJob,
  type PrintRoute,
  reprintPrintJob,
  retryPrintJob,
  revokePrinterConnector,
  testPrinterDevice,
} from "../../../lib/giromesa-api";

const emptyConnector: PrinterConnectorConfig = {
  provider: "local_printer_connector",
  status: "not_configured",
  branchId: null,
  scopes: [],
  hasApiKey: false,
  online: false,
};

const initialPrinterForm = {
  name: "",
  role: "kitchen",
  connectionType: "tcp",
  address: "",
  port: "9100",
  paperWidth: "80",
  charactersPerLine: "48",
  codepage: "cp850",
  cutMode: "partial",
  boldHeader: true,
  beep: false,
  openDrawer: false,
};

const initialRouteForm = {
  name: "",
  targetType: "kitchen_ticket",
  stationId: "",
  printerDeviceId: "",
  copies: "1",
};

export default function PrintingPage() {
  const [branchId, setBranchId] = useState("");
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [routes, setRoutes] = useState<PrintRoute[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [stations, setStations] = useState<KdsStation[]>([]);
  const [connector, setConnector] = useState<PrinterConnectorConfig>(emptyConnector);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [printerForm, setPrinterForm] = useState(initialPrinterForm);
  const [routeForm, setRouteForm] = useState(initialRouteForm);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("Carregando estrutura de impressão...");

  async function load(id = branchId) {
    if (!id) return;
    try {
      const [deviceRows, routeRows, jobRows, stationRows, connectorConfig] = await Promise.all([
        listPrinterDevices(id),
        listPrintRoutes(id),
        listPrintJobs(id),
        listKdsStations(),
        getPrinterConnectorConfig(),
      ]);
      setDevices(deviceRows);
      setRoutes(routeRows);
      setJobs(jobRows);
      setStations(stationRows);
      setConnector(connectorConfig);
      setMessage(
        `${deviceRows.length} impressora(s), ${routeRows.length} rota(s) e ${jobRows.length} trabalho(s).`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar a impressão.");
    }
  }

  async function run(action: () => Promise<void>, successMessage: string) {
    setIsBusy(true);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateDevice() {
    if (!branchId || !printerForm.name.trim()) {
      setMessage("Informe o nome da impressora.");
      return;
    }
    if (printerForm.connectionType === "tcp" && !printerForm.address.trim()) {
      setMessage("Informe o IP ou host da impressora de rede.");
      return;
    }
    await run(async () => {
      await createPrinterDevice({
        branchId,
        name: printerForm.name.trim(),
        role: printerForm.role,
        connectionType: printerForm.connectionType,
        ...(printerForm.address.trim() ? { address: printerForm.address.trim() } : {}),
        ...(printerForm.connectionType === "tcp" ? { port: Number(printerForm.port) || 9100 } : {}),
        paperWidth: printerForm.paperWidth === "58" ? 58 : 80,
        charactersPerLine: Number(printerForm.charactersPerLine) || 48,
        config: {
          codepage: printerForm.codepage,
          cutMode: printerForm.cutMode,
          boldHeader: printerForm.boldHeader,
          beep: printerForm.beep,
          openDrawer: printerForm.openDrawer,
        },
      });
      setPrinterForm(initialPrinterForm);
    }, "Impressora cadastrada.");
  }

  async function handleCreateRoute() {
    if (!branchId || !routeForm.name.trim() || !routeForm.printerDeviceId) {
      setMessage("Informe nome e impressora para criar a rota.");
      return;
    }
    await run(async () => {
      await createPrintRoute({
        branchId,
        name: routeForm.name.trim(),
        trigger: "order_sent",
        targetType: routeForm.targetType,
        ...(routeForm.stationId ? { stationId: routeForm.stationId } : {}),
        printerDeviceId: routeForm.printerDeviceId,
        copies: Math.max(1, Number(routeForm.copies) || 1),
      });
      setRouteForm(initialRouteForm);
    }, "Rota de impressão cadastrada.");
  }

  async function handleConfigureConnector(rotateKey: boolean) {
    if (!branchId) return;
    await run(
      async () => {
        const configured = await configurePrinterConnector(branchId, rotateKey);
        setConnector(configured);
        setGeneratedKey(configured.apiKey ?? null);
      },
      rotateKey ? "Token do conector rotacionado." : "Conector local configurado.",
    );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: bootstrap da filial ao abrir a tela.
  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error("Unidade não encontrada");
        setBranchId(session.branchId);
        await load(session.branchId);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Acesso à impressão não autorizado.");
      }
    })();
  }, []);

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <button className="button secondary" onClick={() => void load()} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Printer size={16} /> Hardware
        </span>
        <h1>Impressão operacional</h1>
        <p>{message}</p>
      </section>
      <PrintingPanel
        printerDevices={devices}
        printRoutes={routes}
        printJobs={jobs}
        kdsStations={stations}
        printerConnectorConfig={connector}
        generatedPrinterConnectorKey={generatedKey}
        printerForm={printerForm}
        printRouteForm={routeForm}
        isBusy={isBusy}
        branchId={branchId || undefined}
        hasCurrentOrder={false}
        onPrinterFormChange={setPrinterForm}
        onPrintRouteFormChange={setRouteForm}
        onCreatePrinterDevice={() => void handleCreateDevice()}
        onTestPrinterDevice={(deviceId) =>
          void run(async () => {
            const result = await testPrinterDevice(deviceId);
            if (!result.ok) throw new Error(result.error ?? "A impressora não respondeu.");
          }, "Teste de conexão concluído com sucesso.")
        }
        onCreatePrintRoute={() => void handleCreateRoute()}
        onCopyConnectorKey={() => {
          if (generatedKey) void navigator.clipboard.writeText(generatedKey);
        }}
        onConfigureConnector={(rotateKey) => void handleConfigureConnector(rotateKey)}
        onRevokeConnector={() =>
          void run(async () => {
            setConnector(await revokePrinterConnector());
            setGeneratedKey(null);
          }, "Token do conector revogado.")
        }
        onPrintBillPreview={() => undefined}
        onExportBillDocument={() => undefined}
        onRetryPrint={(jobId) =>
          void run(async () => {
            await retryPrintJob(jobId);
          }, "Trabalho reenviado para a fila.")
        }
        onReprint={(jobId) =>
          void run(async () => {
            await reprintPrintJob(jobId, "Reimpressão solicitada no painel de hardware");
          }, "Nova via adicionada à fila.")
        }
        readPrintBadgeTone={readPrintBadgeTone}
        readPrintSummary={readPrintSummary}
        readPrintKind={readPrintKind}
        readPrintTone={readPrintTone}
        readPrintStatus={readPrintStatus}
        readConnectorLastSeen={readConnectorLastSeen}
        readConnectorHeartbeatValue={readConnectorHeartbeatValue}
      />
    </main>
  );
}
