import { loadEnv, safeFetch } from "@giromesa/config";
import { Injectable, Logger } from "@nestjs/common";

export type IfoodOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_TO_PICKUP"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELED";

export type IfoodOrderItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

export type IfoodOrder = {
  id: string;
  reference: string;
  displayId: string;
  status: IfoodOrderStatus;
  createdAt: string;
  total: number;
  deliveryFee: number;
  items: IfoodOrderItem[];
  customer: {
    name: string;
    phone: string;
  };
  deliveryAddress?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  rider?: {
    name: string;
    phone: string;
  };
};

const IFOOD_API_BASE = "https://merchant-api.ifood.com.br/v1.0";

const IFOOD_STATUS_MAP: Record<IfoodOrderStatus, string> = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PREPARING: "preparing",
  READY_TO_PICKUP: "ready_for_pickup",
  DISPATCHED: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELED: "canceled",
};

@Injectable()
export class IfoodProvider {
  private readonly logger = new Logger(IfoodProvider.name);
  private readonly request = safeFetch;

  private getConfig() {
    const env = loadEnv();
    return {
      merchantId: env.IFOOD_MERCHANT_ID ?? "",
      apiKey: env.IFOOD_API_KEY ?? "",
      webhookSecret: env.IFOOD_WEBHOOK_SECRET ?? "",
      mode: env.IFOOD_WEBHOOK_MODE,
    };
  }

  mapIfoodStatus(status: IfoodOrderStatus): string {
    return IFOOD_STATUS_MAP[status] ?? "pending";
  }

  async fetchOrders(): Promise<IfoodOrder[]> {
    const config = this.getConfig();

    if (config.mode === "disabled" || !config.apiKey) {
      this.logger.debug("iFood API disabled or not configured, returning empty orders");
      return [];
    }

    if (config.mode === "mock") {
      return this.getMockOrders();
    }

    const response = await this.request(`${IFOOD_API_BASE}/merchants/${config.merchantId}/orders`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      this.logger.error(`iFood API error: ${response.status} ${response.statusText}`);
      throw new Error(`iFood API request failed with status ${response.status}`);
    }

    return (await response.json()) as IfoodOrder[];
  }

  async updateOrderStatus(externalOrderId: string, status: IfoodOrderStatus): Promise<void> {
    const config = this.getConfig();

    if (config.mode === "disabled") {
      this.logger.debug("iFood API disabled, skipping status update");
      return;
    }

    if (config.mode === "mock") {
      this.logger.debug(`Mock: updated order ${externalOrderId} to ${status}`);
      return;
    }

    const response = await this.request(
      `${IFOOD_API_BASE}/merchants/${config.merchantId}/orders/${externalOrderId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      this.logger.error(`iFood status update error: ${response.status} ${response.statusText}`);
      throw new Error(`iFood status update failed with status ${response.status}`);
    }
  }

  async cancelOrder(externalOrderId: string, reason: string): Promise<void> {
    const config = this.getConfig();

    if (config.mode === "disabled") {
      this.logger.debug("iFood API disabled, skipping cancel");
      return;
    }

    if (config.mode === "mock") {
      this.logger.debug(`Mock: canceled order ${externalOrderId} - ${reason}`);
      return;
    }

    await this.updateOrderStatus(externalOrderId, "CANCELED");
  }

  private getMockOrders(): IfoodOrder[] {
    return [
      {
        id: "ifood-mock-001",
        reference: "gm-order-001",
        displayId: "1001",
        status: "PENDING",
        createdAt: new Date().toISOString(),
        total: 4590,
        deliveryFee: 690,
        items: [
          { id: "item-1", name: "Hambúrguer Clássico", quantity: 1, price: 3200 },
          { id: "item-2", name: "Batata Frita", quantity: 1, price: 1390 },
        ],
        customer: { name: "Cliente Mock", phone: "(11) 99999-0000" },
        deliveryAddress: {
          street: "Rua Exemplo",
          number: "123",
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          zipCode: "01001-000",
        },
      },
    ];
  }
}
