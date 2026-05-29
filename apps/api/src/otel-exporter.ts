import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import {
  ApiTelemetryEvent,
  getTelemetryExportStatus,
  registerTelemetrySink,
  setTelemetryExportStatus,
} from "./observability.js";

const DEFAULT_SERVICE_NAME = "sovereign-ops-api";

let provider: NodeTracerProvider | undefined;
let unregisterSink: (() => void) | undefined;

function serviceNameFromEnv(): string {
  return process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME;
}

function endpointConfigured(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());
}

function otelEnabledFromEnv(): boolean {
  return process.env.SOVEREIGN_OTEL_ENABLED === "true" || endpointConfigured();
}

function parseOtlpHeaders(value: string | undefined): Record<string, string> | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  for (const pair of value.split(",")) {
    const separatorIndex = pair.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const headerValue = pair.slice(separatorIndex + 1).trim();

    if (key && headerValue) {
      headers[key] = headerValue;
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function emitTelemetrySpan(event: ApiTelemetryEvent): void {
  if (!provider || !getTelemetryExportStatus().otelEnabled) {
    return;
  }

  const tracer = trace.getTracer(serviceNameFromEnv());
  const span = tracer.startSpan(event.eventType, {
    kind: event.eventType === "http.request" ? SpanKind.SERVER : SpanKind.INTERNAL,
    attributes: {
      "sovereign.request_id": event.requestId,
      "sovereign.route": event.route,
      "sovereign.method": event.method,
      "sovereign.event_type": event.eventType,
      ...(event.statusCode === undefined ? {} : { "http.response.status_code": event.statusCode }),
      ...(event.advisor === undefined ? {} : { "sovereign.advisor": event.advisor }),
      ...(event.durationMs === undefined ? {} : { "sovereign.duration_ms": event.durationMs }),
      ...(event.errorCode === undefined ? {} : { "sovereign.error_code": event.errorCode }),
    },
  });

  if (event.eventType === "api.error" || (event.statusCode !== undefined && event.statusCode >= 400)) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: event.errorCode ?? `HTTP ${event.statusCode}`,
    });
  }

  span.end();
}

export function initializeOtelExportIfEnabled(): void {
  const serviceName = serviceNameFromEnv();
  const hasEndpoint = endpointConfigured();

  if (!otelEnabledFromEnv()) {
    setTelemetryExportStatus({
      otelEnabled: false,
      serviceName,
      endpointConfigured: hasEndpoint,
    });
    return;
  }

  const exporter = new OTLPTraceExporter({
    ...(hasEndpoint ? { url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
    ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? { headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS) }
      : {}),
  });

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();

  unregisterSink = registerTelemetrySink(emitTelemetrySpan);
  setTelemetryExportStatus({
    otelEnabled: true,
    serviceName,
    endpointConfigured: hasEndpoint,
  });

  console.log(
    `OpenTelemetry trace export enabled for service ${serviceName}. Endpoint configured: ${hasEndpoint ? "yes" : "no"}.`,
  );
}

export async function shutdownOtelExport(): Promise<void> {
  unregisterSink?.();
  unregisterSink = undefined;

  if (!provider) {
    return;
  }

  const activeProvider = provider;
  provider = undefined;
  await activeProvider.shutdown();
}
