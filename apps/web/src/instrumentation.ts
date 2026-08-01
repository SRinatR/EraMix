/**
 * Next.js's official server-startup hook. Only the Node.js runtime (not the
 * Edge runtime, which the proxy/middleware uses) can run the OpenTelemetry
 * Node SDK — see packages/infrastructure/src/telemetry.ts for the no-op
 * behaviour when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
 */
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    const { startTelemetry } = await import('@eramix/infrastructure');
    startTelemetry({
      serviceName: 'eramix-web',
      ...(process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] !== undefined
        ? { otlpEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] }
        : {}),
    });
  }
}
