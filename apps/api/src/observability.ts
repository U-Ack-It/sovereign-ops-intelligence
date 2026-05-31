import { listApiAuditEvents } from "./agents/audit-trail.js";

export type ApiTelemetryEventType =
  | "http.request"
  | "advisor.route"
  | "advisor.execute"
  | "skill.execute"
  | "api.error";

export type ApiTelemetryEvent = {
  timestamp: string;
  eventType: ApiTelemetryEventType;
  requestId: string;
  route: string;
  method: string;
  statusCode?: number;
  advisor?: string;
  durationMs?: number;
  errorCode?: string;
  actionPolicyDecision?: string;
};

export type ApiTelemetrySink = (event: ApiTelemetryEvent) => void;

export type ApiTelemetryExportStatus = {
  otelEnabled: boolean;
  serviceName: string;
  endpointConfigured: boolean;
};

export type ApiMetricsSnapshot = {
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    pid: number;
    environment: string;
  };
  http: {
    totalRequests: number;
    successResponses: number;
    errorResponses: number;
    statusCodeCounts: Record<string, number>;
    routeCounts: Record<string, number>;
    methodCounts: Record<string, number>;
  };
  audit: {
    totalRetainedEvents: number;
    successCount: number;
    errorCount: number;
    advisorRouteCount: number;
    advisorExecuteCount: number;
    skillExecuteCount: number;
    apiErrorCount: number;
  };
  telemetry: {
    recentEvents: ApiTelemetryEvent[];
  };
  export: ApiTelemetryExportStatus;
};

type HttpRequestMetricInput = {
  requestId: string;
  method: string | undefined;
  route: string;
  statusCode: number;
  durationMs?: number;
};

type TelemetryEventInput = {
  eventType: ApiTelemetryEventType;
  requestId: string;
  route: string;
  method: string | undefined;
  statusCode?: number;
  advisor?: string;
  durationMs?: number;
  errorCode?: string;
  actionPolicyDecision?: string;
};

const MAX_RETAINED_TELEMETRY_EVENTS = 100;
const DEFAULT_SERVICE_NAME = "sovereign-ops-api";

const httpMetrics = {
  totalRequests: 0,
  successResponses: 0,
  errorResponses: 0,
  statusCodeCounts: {} as Record<string, number>,
  routeCounts: {} as Record<string, number>,
  methodCounts: {} as Record<string, number>,
};
const telemetryEvents: ApiTelemetryEvent[] = [];
const telemetrySinks = new Set<ApiTelemetrySink>();
let telemetryExportStatus: ApiTelemetryExportStatus = {
  otelEnabled: false,
  serviceName: process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME,
  endpointConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
};

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function normalizeDurationMs(durationMs: number | undefined): number | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }

  return Math.round(durationMs);
}

export function recordTelemetryEvent(input: TelemetryEventInput): void {
  const event: ApiTelemetryEvent = {
    timestamp: new Date().toISOString(),
    eventType: input.eventType,
    requestId: input.requestId,
    route: input.route,
    method: input.method ?? "UNKNOWN",
    statusCode: input.statusCode,
    advisor: input.advisor,
    durationMs: normalizeDurationMs(input.durationMs),
    errorCode: input.errorCode,
    actionPolicyDecision: input.actionPolicyDecision,
  };

  telemetryEvents.unshift(event);

  if (telemetryEvents.length > MAX_RETAINED_TELEMETRY_EVENTS) {
    telemetryEvents.length = MAX_RETAINED_TELEMETRY_EVENTS;
  }

  for (const sink of telemetrySinks) {
    try {
      sink({ ...event });
    } catch {
      // Telemetry sinks must never block or crash the API response path.
    }
  }
}

export function recordHttpRequestMetric(input: HttpRequestMetricInput): void {
  const method = input.method ?? "UNKNOWN";
  const statusCode = String(input.statusCode);

  httpMetrics.totalRequests += 1;

  if (input.statusCode >= 400) {
    httpMetrics.errorResponses += 1;
  } else {
    httpMetrics.successResponses += 1;
  }

  incrementCounter(httpMetrics.statusCodeCounts, statusCode);
  incrementCounter(httpMetrics.routeCounts, input.route);
  incrementCounter(httpMetrics.methodCounts, method);
  recordTelemetryEvent({
    eventType: "http.request",
    requestId: input.requestId,
    method,
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
  });
}

export function getApiMetricsSnapshot(): ApiMetricsSnapshot {
  const auditEvents = listApiAuditEvents({ limit: 100 });

  return {
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      environment: process.env.NODE_ENV ?? "development",
    },
    http: {
      totalRequests: httpMetrics.totalRequests,
      successResponses: httpMetrics.successResponses,
      errorResponses: httpMetrics.errorResponses,
      statusCodeCounts: { ...httpMetrics.statusCodeCounts },
      routeCounts: { ...httpMetrics.routeCounts },
      methodCounts: { ...httpMetrics.methodCounts },
    },
    audit: {
      totalRetainedEvents: auditEvents.length,
      successCount: auditEvents.filter((event) => event.status === "success").length,
      errorCount: auditEvents.filter((event) => event.status === "error").length,
      advisorRouteCount: auditEvents.filter((event) => event.eventType === "advisor.route").length,
      advisorExecuteCount: auditEvents.filter((event) => event.eventType === "advisor.execute").length,
      skillExecuteCount: auditEvents.filter((event) => event.eventType === "skill.execute").length,
      apiErrorCount: auditEvents.filter((event) => event.eventType === "api.error").length,
    },
    telemetry: {
      recentEvents: telemetryEvents.slice(0, 25),
    },
    export: { ...telemetryExportStatus },
  };
}

export function registerTelemetrySink(sink: ApiTelemetrySink): () => void {
  telemetrySinks.add(sink);

  return () => {
    telemetrySinks.delete(sink);
  };
}

export function setTelemetryExportStatus(status: ApiTelemetryExportStatus): void {
  telemetryExportStatus = {
    otelEnabled: status.otelEnabled,
    serviceName: status.serviceName,
    endpointConfigured: status.endpointConfigured,
  };
}

export function getTelemetryExportStatus(): ApiTelemetryExportStatus {
  return { ...telemetryExportStatus };
}

export function resetApiMetrics(): void {
  httpMetrics.totalRequests = 0;
  httpMetrics.successResponses = 0;
  httpMetrics.errorResponses = 0;
  httpMetrics.statusCodeCounts = {};
  httpMetrics.routeCounts = {};
  httpMetrics.methodCounts = {};
  telemetryEvents.length = 0;
  telemetrySinks.clear();
  telemetryExportStatus = {
    otelEnabled: false,
    serviceName: process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME,
    endpointConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
  };
}
