// Simple in-memory metrics collector for Prometheus-compatible metrics
// No external dependencies required

type MetricType = "counter" | "gauge" | "histogram";

type MetricValue = {
  type: MetricType;
  value: number;
  count?: number;
  labels: Record<string, string>;
  help: string;
  buckets?: number[];
};

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Counter {
  private value = 0;

  constructor(
    private readonly name: string,
    private readonly help: string,
  ) {}

  inc(labels: Record<string, string> = {}, value = 1) {
    this.value += value;
    metricsStore.set(this.name, {
      type: "counter",
      value: this.value,
      labels,
      help: this.help,
    });
  }
}

class Gauge {
  private value = 0;

  constructor(
    private readonly name: string,
    private readonly help: string,
  ) {}

  set(labels: Record<string, string>, value: number) {
    this.value = value;
    metricsStore.set(this.name, {
      type: "gauge",
      value,
      labels,
      help: this.help,
    });
  }

  inc(labels: Record<string, string> = {}, value = 1) {
    this.value += value;
    metricsStore.set(this.name, {
      type: "gauge",
      value: this.value,
      labels,
      help: this.help,
    });
  }
}

class Histogram {
  private buckets: Map<number, number> = new Map();
  private sum = 0;
  private count = 0;

  constructor(
    private readonly name: string,
    private readonly help: string,
    bucketValues: number[] = DEFAULT_HISTOGRAM_BUCKETS,
  ) {
    for (const bucket of bucketValues) {
      this.buckets.set(bucket, 0);
    }
  }

  observe(labels: Record<string, string>, value: number) {
    this.sum += value;
    this.count++;
    for (const [bucket, _] of this.buckets) {
      if (value <= bucket) {
        this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + 1);
      }
    }
    metricsStore.set(this.name, {
      type: "histogram",
      value: this.sum,
      count: this.count,
      labels,
      help: this.help,
      buckets: Array.from(this.buckets.entries()).map(([k]) => k),
    });
  }
}

const metricsStore = new Map<string, MetricValue>();

export function createCounter(name: string, help: string) {
  return new Counter(name, help);
}

export function createGauge(name: string, help: string) {
  return new Gauge(name, help);
}

export function createHistogram(name: string, help: string, buckets?: number[]) {
  return new Histogram(name, help, buckets);
}

export function getMetricsAsText(): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const [name, metric] of metricsStore) {
    if (seen.has(name)) continue;
    seen.add(name);

    lines.push(`# HELP ${name} ${metric.help}`);
    lines.push(`# TYPE ${name} ${metric.type}`);

    if (metric.type === "histogram" && metric.buckets) {
      for (const bucket of metric.buckets) {
        const count = metricsStore.get(`${name}_bucket_${bucket}`)?.value ?? 0;
        lines.push(
          `${name}_bucket{le="${bucket}",${Object.entries(metric.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(",")}} ${count}`,
        );
      }
      lines.push(
        `${name}_sum{${Object.entries(metric.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",")}} ${metric.value}`,
      );
      lines.push(
        `${name}_count{${Object.entries(metric.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",")}} ${metric.count}`,
      );
    } else {
      const labelsStr =
        Object.entries(metric.labels).length > 0
          ? `{${Object.entries(metric.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(",")}}`
          : "";
      lines.push(`${name}${labelsStr} ${metric.value}`);
    }
  }

  return lines.join("\n");
}

export function getMetricsAsJson(): Record<string, MetricValue> {
  return Object.fromEntries(metricsStore);
}

export function resetMetrics() {
  metricsStore.clear();
}
