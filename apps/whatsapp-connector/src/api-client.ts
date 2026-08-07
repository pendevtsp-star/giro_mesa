import { z } from "zod";

const heartbeatResponse = z.object({ accepted: z.boolean() }).passthrough();

export type ConnectorHeartbeat = {
  version: string;
  status: "connecting" | "open" | "closed" | "logged_out";
  qr?: string;
  phone?: string;
};

export class GiroMesaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly connectorKey: string,
  ) {}

  async heartbeat(input: ConnectorHeartbeat): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/integrations/whatsapp-qr/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-giromesa-connector-key": this.connectorKey,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`GiroMesa heartbeat failed (${response.status})`);
    }
    heartbeatResponse.parse(await response.json());
  }
}
