import { SystemClock } from '@eramix/application';
import type { AnalyticsEventSink } from '@eramix/application';
import {
  DevEmailSender,
  Ga4EventSink,
  HttpIndexNowNotifier,
  JsonLogger,
  PrismaOutboxMessageRepository,
  PrismaPlatformSettingsRepository,
  RustAnalyticsEventSink,
  YandexMetricaEventSink,
  createPrismaClient,
  loadEnv,
  startTelemetry,
} from '@eramix/infrastructure';
import { processOutboxBatch } from './outbox-worker.js';
import { createGracefulShutdown } from './shutdown.js';

const POLL_INTERVAL_MS = 5_000;

const env = loadEnv();
const logger = new JsonLogger();
logger.log('info', 'worker_starting', { nodeEnv: env.NODE_ENV });

startTelemetry({
  serviceName: 'eramix-worker',
  ...(env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined
    ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }
    : {}),
});

// GA4/Yandex Metrica/Rust analytics sinks (CLAUDE.md: consent-gated event
// registry). All three are always structurally registered — per-event
// consent/PlatformSettings-enablement gating happens inside
// dispatchAnalyticsEvent, and each sink independently declines when its own
// live-configured ID is missing (Ga4EventSink/YandexMetricaEventSink) or
// unconditionally (RustAnalyticsEventSink — no real endpoint exists yet).
// Only GA4 needs a deployment secret to even construct; without it, GA4 is
// simply not registered (never enabled with an empty/placeholder secret).
const analyticsSinks: AnalyticsEventSink[] = [
  new YandexMetricaEventSink(),
  new RustAnalyticsEventSink(),
];
if (env.GA4_API_SECRET !== undefined) {
  analyticsSinks.push(new Ga4EventSink({ apiSecret: env.GA4_API_SECRET }));
}

const prisma = createPrismaClient(env.DATABASE_URL);
const deps = {
  outbox: new PrismaOutboxMessageRepository(prisma),
  email: new DevEmailSender(logger),
  logger,
  clock: new SystemClock(),
  // IndexNow (CLAUDE.md: P1, Bing/Yandex-only). Settings/enablement are
  // re-checked live every batch inside processOutboxBatch, not cached here
  // — this only wires the notifier/repository/secret, all three of which
  // are required together before any submission is attempted.
  indexNow: new HttpIndexNowNotifier(),
  settingsRepo: new PrismaPlatformSettingsRepository(prisma),
  ...(env.INDEXNOW_KEY !== undefined ? { indexNowKey: env.INDEXNOW_KEY } : {}),
  analyticsSinks,
};

let stopped = false;

async function pollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const result = await processOutboxBatch(deps);
      if (result.claimed > 0) {
        logger.log('info', 'outbox_batch_processed', { ...result });
      }
    } catch (error) {
      logger.log('error', 'outbox_poll_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

const pollPromise = pollLoop();

const shutdown = createGracefulShutdown({
  timeoutMs: 10_000,
  onShutdown: async () => {
    stopped = true;
    await pollPromise;
    await prisma.$disconnect();
    logger.log('info', 'worker_shutdown_complete', {});
  },
});

process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
