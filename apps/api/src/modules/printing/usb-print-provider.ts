import { getDeviceList } from "usb";

const EPSON_VENDOR_ID = 0x04b8;
const BEMATECH_VENDOR_ID = 0x0d3a;
const ELGIN_VENDOR_ID = 0x1fc9;

const PRINTER_CLASS = 7;
const PRINTER_SUBCLASS = 1;

export type UsbPrintConfig = {
  vendorId?: number | undefined;
  productId?: number | undefined;
  timeoutMs?: number;
};

export type UsbPrinterInfo = {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  connectionType: "usb";
};

export function discoverUsbPrinters(): UsbPrinterInfo[] {
  const devices = getDeviceList();
  const printers: UsbPrinterInfo[] = [];

  for (const device of devices) {
    const descriptor = device.deviceDescriptor;
    const isPrinter = hasPrinterInterface(device);
    const isKnownBrand =
      descriptor.idVendor === EPSON_VENDOR_ID ||
      descriptor.idVendor === BEMATECH_VENDOR_ID ||
      descriptor.idVendor === ELGIN_VENDOR_ID;

    if (isPrinter || isKnownBrand) {
      printers.push({
        vendorId: descriptor.idVendor,
        productId: descriptor.idProduct,
        connectionType: "usb",
      });
    }
  }

  return printers;
}

function hasPrinterInterface(device: ReturnType<typeof getDeviceList>[number]): boolean {
  const configDescriptor = device.configDescriptor;
  if (!configDescriptor?.interfaces) {
    return false;
  }
  for (const alternates of configDescriptor.interfaces) {
    if (!alternates) {
      continue;
    }
    for (const alt of alternates) {
      if (alt.bInterfaceClass === PRINTER_CLASS && alt.bInterfaceSubClass === PRINTER_SUBCLASS) {
        return true;
      }
    }
  }
  return false;
}

export async function testUsbConnection(
  config: UsbPrintConfig,
): Promise<{ ok: boolean; error?: string }> {
  const device = findUsbDevice(config);
  if (!device) {
    return { ok: false, error: "usb_device_not_found" };
  }

  try {
    device.open();
    const iface = claimPrinterInterface(device);
    if (!iface) {
      return { ok: false, error: "no_printer_interface" };
    }

    const outEndpoint = findOutEndpoint(iface);
    if (!outEndpoint) {
      return { ok: false, error: "no_output_endpoint" };
    }

    await outEndpoint.transferAsync(Buffer.alloc(1));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "usb_test_failed" };
  } finally {
    try {
      device.close();
    } catch {
      // already closed
    }
  }
}

export async function sendEscPosUsb(
  config: UsbPrintConfig,
  renderedText: string,
  printerConfig: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  const device = findUsbDevice(config);
  if (!device) {
    return { ok: false, error: "usb_device_not_found" };
  }

  try {
    device.open();
    const iface = claimPrinterInterface(device);
    if (!iface) {
      return { ok: false, error: "no_printer_interface" };
    }

    const outEndpoint = findOutEndpoint(iface);
    if (!outEndpoint) {
      return { ok: false, error: "no_output_endpoint" };
    }

    const payload = buildEscPosPayload(renderedText, printerConfig);
    const chunkSize = 4096;

    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      const chunk = payload.subarray(offset, Math.min(offset + chunkSize, payload.length));
      await outEndpoint.transferAsync(Buffer.from(chunk));
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "usb_print_failed" };
  } finally {
    try {
      device.close();
    } catch {
      // already closed
    }
  }
}

function findUsbDevice(
  config: UsbPrintConfig,
): ReturnType<typeof getDeviceList>[number] | undefined {
  const devices = getDeviceList();

  for (const device of devices) {
    const descriptor = device.deviceDescriptor;
    const matchesVendor = config.vendorId ? descriptor.idVendor === config.vendorId : true;
    const matchesProduct = config.productId ? descriptor.idProduct === config.productId : true;

    if (matchesVendor && matchesProduct && hasPrinterInterface(device)) {
      return device;
    }
  }

  return undefined;
}

function claimPrinterInterface(device: ReturnType<typeof getDeviceList>[number]) {
  const configDescriptor = device.configDescriptor;
  if (!configDescriptor?.interfaces) {
    return undefined;
  }

  for (let i = 0; i < configDescriptor.interfaces.length; i++) {
    const alternates = configDescriptor.interfaces[i];
    if (!alternates) {
      continue;
    }
    for (const alt of alternates) {
      if (alt.bInterfaceClass === PRINTER_CLASS && alt.bInterfaceSubClass === PRINTER_SUBCLASS) {
        const iface = device.interface(i);
        if (!iface.isKernelDriverActive()) {
          iface.claim();
          return iface;
        }
        try {
          iface.detachKernelDriver();
          iface.claim();
          return iface;
        } catch {
          // kernel driver could not be detached
        }
      }
    }
  }

  return undefined;
}

function findOutEndpoint(iface: { endpoints: Array<{ direction: string }> }) {
  for (const endpoint of iface.endpoints) {
    if (endpoint.direction === "out") {
      return endpoint as { direction: "out"; transferAsync: (buffer: Buffer) => Promise<number> };
    }
  }
  return undefined;
}

function buildEscPosPayload(text: string, config: Record<string, unknown>): Buffer {
  const codepage = readString(config.codepage) ?? "cp850";
  const cutMode = readString(config.cutMode) ?? "partial";
  const boldHeader = readBoolean(config.boldHeader) ?? true;
  const beep = readBoolean(config.beep) ?? false;
  const openDrawer = readBoolean(config.openDrawer) ?? false;

  const chunks: Buffer[] = [Buffer.from([0x1b, 0x40]), codepageCommand(codepage)];

  if (openDrawer) {
    chunks.push(Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x64]));
  }

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const isHeader = boldHeader && index < 2 && line.trim().length > 0;
    if (isHeader) {
      chunks.push(Buffer.from([0x1b, 0x45, 0x01]));
    }
    chunks.push(encodeEscPosText(`${line}\n`, codepage));
    if (isHeader) {
      chunks.push(Buffer.from([0x1b, 0x45, 0x00]));
    }
  });

  if (beep) {
    chunks.push(Buffer.from([0x07]));
  }

  chunks.push(Buffer.from("\n\n", "ascii"));
  chunks.push(cutCommand(cutMode));
  return Buffer.concat(chunks);
}

function codepageCommand(codepage: string): Buffer {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp860") {
    return Buffer.from([0x1b, 0x74, 0x03]);
  }
  if (normalized === "windows1252" || normalized === "cp1252") {
    return Buffer.from([0x1b, 0x74, 0x10]);
  }
  return Buffer.from([0x1b, 0x74, 0x02]);
}

function cutCommand(cutMode: string): Buffer {
  return cutMode === "full" ? Buffer.from([0x1d, 0x56, 0x00]) : Buffer.from([0x1d, 0x56, 0x01]);
}

function encodeEscPosText(text: string, codepage: string): Buffer {
  const normalized = codepage.toLowerCase();
  if (normalized === "cp850" || normalized === "cp860") {
    return Buffer.from([...text].map((char) => cp850Byte(char)));
  }
  return Buffer.from(text, "latin1");
}

function cp850Byte(char: string): number {
  const code = char.charCodeAt(0);
  if (code <= 0x7f) {
    return code;
  }

  const map: Record<string, number> = {
    ç: 0x87,
    Ç: 0x80,
    á: 0xa0,
    à: 0x85,
    ã: 0xc6,
    â: 0x83,
    Á: 0xb5,
    À: 0xb7,
    Ã: 0xc7,
    Â: 0xb6,
    é: 0x82,
    ê: 0x88,
    É: 0x90,
    Ê: 0xd2,
    í: 0xa1,
    Í: 0xd6,
    ó: 0xa2,
    õ: 0xe4,
    ô: 0x93,
    Ó: 0xe0,
    Õ: 0xe5,
    Ô: 0xe2,
    ú: 0xa3,
    Ú: 0xe9,
    ü: 0x81,
    Ü: 0x9a,
    º: 0xa7,
  };

  return map[char] ?? "?".charCodeAt(0);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
