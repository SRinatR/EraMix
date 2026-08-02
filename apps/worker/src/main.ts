import { SystemClock } from '@eramix/application';
import {
  DevEmailSender,
  HttpIndexNowNotifier,
  JsonLogger,
  PrismaOutboxMessageRepository,
  PrismaPlatformSettingsRepository,
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
