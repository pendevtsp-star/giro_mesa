// Request metrics middleware for tracking HTTP request metrics
import { createCounter, createHistogram } from "./metrics";

type MetricsRequest = {
  method: string;
  routeOptions: { url: string | undefined };
  url: string;
};

type MetricsReply = {
  raw: { on(event: "finish", listener: () => void): unknown };
  statusCode: number;
};

const httpRequestCount = createCounter(
  "giromesa_http_requests_total",
  "Total number of HTTP requests",
);

const httpRequestDuration = createHistogram(
  "giromesa_http_request_duration_seconds",
  "HTTP request duration in seconds",
);

const httpErrorsCount = createCounter("giromesa_http_errors_total", "Total number of HTTP errors");

export async function metricsMiddleware(request: MetricsRequest, reply: MetricsReply) {
  const startTime = process.hrtime.bigint();
  const route = request.routeOptions?.url ?? request.url;
  const method = request.method;

  reply.raw.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
    const statusCode = reply.statusCode;

    httpRequestCount.inc({
      method,
      route: normalizeRoute(route),
      status_code: String(statusCode),
    });

    httpRequestDuration.observe(
      { method, route: normalizeRoute(route), status_code: String(statusCode) },
      duration,
    );

    if (statusCode >= 400) {
      httpErrorsCount.inc({
        method,
        route: normalizeRoute(route),
        status_code: String(statusCode),
      });
    }
  });
}

function normalizeRoute(route: string): string {
  // Normalize route by replacing dynamic segments with placeholders
  // e.g., /api/v1/pos/orders/123 -> /api/v1/pos/orders/:id
  return route
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid")
    .replace(/\/\d+/g, "/:id");
}
