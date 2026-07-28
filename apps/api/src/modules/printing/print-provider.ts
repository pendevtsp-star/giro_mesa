import type { PrintProvider, ProviderResult } from "@giromesa/domain";
import { renderKitchenTicket } from "./print-renderer";
import { sendEscPosTcp, testTcpConnection } from "./tcp-print-provider";
import { sendEscPosUsb, testUsbConnection } from "./usb-print-provider";

export class MockPrintProvider implements PrintProvider {
  renderKitchenTicket(
    input: Parameters<PrintProvider["renderKitchenTicket"]>[0],
  ): ProviderResult<{ renderedText: string }> {
    return {
      ok: true,
      externalId: `mock-print-${Date.now()}`,
      data: {
        renderedText: renderKitchenTicket(input),
      },
    };
  }
}

export type PrinterDeviceConfig = {
  connectionType: string;
  address?: string | null;
  port?: number | null;
  config?: Record<string, unknown> | null;
};

export function createPrintProvider(device?: PrinterDeviceConfig | null): PrintProvider {
  if (!device || device.connectionType === "mock" || device.connectionType === "os") {
    return new MockPrintProvider();
  }

  if (device.connectionType === "network" && device.address) {
    return new TcpPrintProvider({
      host: device.address,
      port: device.port ?? 9100,
      config: device.config ?? {},
    });
  }

  if (device.connectionType === "usb") {
    return new UsbPrintProvider({
      config: device.config ?? {},
    });
  }

  return new MockPrintProvider();
}

export async function testDeviceConnection(
  device: PrinterDeviceConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (device.connectionType === "network" && device.address) {
    return testTcpConnection({ host: device.address, port: device.port ?? 9100 });
  }

  if (device.connectionType === "usb") {
    const vendorId =
      device.config && typeof device.config.vendorId === "number"
        ? device.config.vendorId
        : undefined;
    const productId =
      device.config && typeof device.config.productId === "number"
        ? device.config.productId
        : undefined;
    return testUsbConnection({ vendorId, productId });
  }

  return { ok: true };
}

export { discoverUsbPrinters } from "./usb-print-provider";

export async function printToDevice(
  device: PrinterDeviceConfig,
  renderedText: string,
): Promise<{ ok: boolean; error?: string }> {
  if (device.connectionType === "network" && device.address) {
    return sendEscPosTcp(
      { host: device.address, port: device.port ?? 9100 },
      renderedText,
      device.config ?? {},
    );
  }

  if (device.connectionType === "usb") {
    const vendorId =
      device.config && typeof device.config.vendorId === "number"
        ? device.config.vendorId
        : undefined;
    const productId =
      device.config && typeof device.config.productId === "number"
        ? device.config.productId
        : undefined;
    return sendEscPosUsb({ vendorId, productId }, renderedText, device.config ?? {});
  }

  return { ok: false, error: "unsupported_connection_type" };
}

class TcpPrintProvider implements PrintProvider {
  private readonly host: string;
  private readonly port: number;
  private readonly config: Record<string, unknown>;

  constructor(options: { host: string; port: number; config: Record<string, unknown> }) {
    this.host = options.host;
    this.port = options.port;
    this.config = options.config;
  }

  renderKitchenTicket(
    input: Parameters<PrintProvider["renderKitchenTicket"]>[0],
  ): ProviderResult<{ renderedText: string }> {
    return {
      ok: true,
      externalId: `tcp-${Date.now()}`,
      data: {
        renderedText: renderKitchenTicket(input),
      },
    };
  }

  getHost() {
    return this.host;
  }

  getPort() {
    return this.port;
  }

  getConfig() {
    return this.config;
  }
}

class UsbPrintProvider implements PrintProvider {
  private readonly config: Record<string, unknown>;

  constructor(options: { config: Record<string, unknown> }) {
    this.config = options.config;
  }

  renderKitchenTicket(
    input: Parameters<PrintProvider["renderKitchenTicket"]>[0],
  ): ProviderResult<{ renderedText: string }> {
    return {
      ok: true,
      externalId: `usb-${Date.now()}`,
      data: {
        renderedText: renderKitchenTicket(input),
      },
    };
  }

  getConfig() {
    return this.config;
  }
}
