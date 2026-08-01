import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryConfig {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  /** OTLP/HTTP traces endpoint (e.g. `http://otel-collector:4318/v1/traces`). Telemetry is a no-op when unset. */
  readonly otlpEndpoint?: string;
}

/**
 * Starts the OpenTelemetry Node SDK for distributed tracing, exporting via
 * OTLP/HTTP to a Collector (CLAUDE.md: "export via OTLP Collector"; W3C
 * Trace Context is the propagation format, matching the traceparent header
 * apps/web/src/server/trace.ts already reads/threads through RFC 9457
 * responses and structured logs).
 *
 * Scope note: this wires traces only. Metrics-via-OTel and logs-via-OTel
 * are not yet implemented — structured JSON logging (packages/
 * infrastructure/src/logger.ts) already satisfies "structured JSON logs
 * with trace correlation" by embedding the same traceId, without depending
 * on OTel's still-more-experimental Logs SDK. Extending to OTel metrics/logs
 * is a follow-up, not a Q-numbered open question or an invented requirement
 * — see docs/IMPLEMENTATION_ROADMAP.md Phase 7.
 *
 * No-ops (returns undefined, does not start the SDK) when `otlpEndpoint` is
 * unset, so every environment without a reachable Collector configured
 * keeps working exactly as before.
 */
export function startTelemetry(config: TelemetryConfig): NodeSDK | undefined {
  if (!config.otlpEndpoint) {
    return undefined;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      ...(config.serviceVersion !== undefined
        ? { [ATTR_SERVICE_VERSION]: config.serviceVersion }
        : {}),
    }),
    traceExporter: new OTLPTraceExporter({ url: config.otlpEndpoint }),
  });
  sdk.start();
  return sdk;
}
