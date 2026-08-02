import type {
  Clock,
  EmailSender,
  IndexNowNotifier,
  IndexNowSubmissionInput,
  IndexNowSubmissionResult,
  OutboxMessageRepository,
  PlatformSettingsRepository,
} from '@eramix/application';
import type { OutboxMessage, PlatformSettings } from '@eramix/domain';
import type { Logger } from '@eramix/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { MAX_OUTBOX_ATTEMPTS, processOutboxBatch } from './outbox-worker.js';

class InMemoryOutbox implements OutboxMessageRepository {
  private readonly messages = new Map<string, OutboxMessage>();
  private nextId = 1;

  seed(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
    const message: OutboxMessage = {
      id: `msg-${this.nextId++}`,
      aggregateType: 'Order',
      aggregateId: 'order-1',
      eventType: 'order.submitted',
      payload: {},
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(0),
      ...overrides,
    };
    this.messages.set(message.id, message);
    return message;
  }

  enqueue(): Promise<OutboxMessage> {
    throw new Error('not needed for these tests');
  }

  claimPending(limit: number): Promise<readonly OutboxMessage[]> {
    return Promise.resolve(
      [...this.messages.values()]
        .filter(
          (m) => (m.status === 'PENDING' || m.status === 'FAILED') && m.availableAt <= new Date(),
        )
        .slice(0, limit),
    );
  }

  markSent(id: string): Promise<void> {
    const m = this.messages.get(id)!;
    this.messages.set(id, { ...m, status: 'SENT' });
    return Promise.resolve();
  }

  markFailed(id: string, error: string, nextAvailableAt: Date): Promise<void> {
    const m = this.messages.get(id)!;
    this.messages.set(id, {
      ...m,
      status: 'FAILED',
      lastError: error,
      availableAt: nextAvailableAt,
      attempts: m.attempts + 1,
    });
    return Promise.resolve();
  }

  markDeadLetter(id: string, error: string): Promise<void> {
    const m = this.messages.get(id)!;
    this.messages.set(id, {
      ...m,
      status: 'DEAD_LETTER',
      lastError: error,
      attempts: m.attempts + 1,
    });
    return Promise.resolve();
  }

  get(id: string): OutboxMessage | undefined {
    return this.messages.get(id);
  }
}

function fakeLogger(): Logger {
  return { log: () => undefined };
}

function fixedClock(time: Date): Clock {
  return { now: () => time };
}

function makePlatformSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: true,
    merchantCenterEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function fakeSettingsRepo(settings: PlatformSettings): PlatformSettingsRepository {
  return {
    get: () => Promise.resolve(settings),
    update: () => {
      throw new Error('not needed for these tests');
    },
  };
}

describe('processOutboxBatch', () => {
  it('marks a successfully dispatched message SENT', async () => {
    const outbox = new InMemoryOutbox();
    const seeded = outbox.seed();
    const email: EmailSender = { send: () => Promise.resolve() };

    const result = await processOutboxBatch({
      outbox,
      email,
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
    });

    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, deadLettered: 0 });
    expect(outbox.get(seeded.id)?.status).toBe('SENT');
  });

  it('schedules a backed-off retry on a dispatch failure below the attempt ceiling', async () => {
    const outbox = new InMemoryOutbox();
    const seeded = outbox.seed({ attempts: 1 });
    const email: EmailSender = { send: () => Promise.reject(new Error('smtp down')) };
    const now = new Date('2026-08-01T00:00:00Z');

    const result = await processOutboxBatch({
      outbox,
      email,
      logger: fakeLogger(),
      clock: fixedClock(now),
    });

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 1, deadLettered: 0 });
    const updated = outbox.get(seeded.id)!;
    expect(updated.status).toBe('FAILED');
    expect(updated.attempts).toBe(2);
    expect(updated.availableAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('moves a message to DEAD_LETTER once MAX_OUTBOX_ATTEMPTS is reached, never retrying again', async () => {
    const outbox = new InMemoryOutbox();
    const seeded = outbox.seed({ attempts: MAX_OUTBOX_ATTEMPTS - 1 });
    const email: EmailSender = { send: () => Promise.reject(new Error('permanently broken')) };

    const result = await processOutboxBatch({
      outbox,
      email,
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
    });

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 0, deadLettered: 1 });
    expect(outbox.get(seeded.id)?.status).toBe('DEAD_LETTER');

    // A dead-lettered message must never be claimed again.
    const second = await processOutboxBatch({
      outbox,
      email,
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
    });
    expect(second.claimed).toBe(0);
  });

  it('does not claim a message whose backoff window has not yet elapsed', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({ status: 'FAILED', availableAt: new Date(Date.now() + 60_000) });
    const email: EmailSender = { send: () => Promise.resolve() };

    const result = await processOutboxBatch({
      outbox,
      email,
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
    });

    expect(result.claimed).toBe(0);
  });
});

describe('processOutboxBatch — IndexNow (P1 adapter)', () => {
  const SUCCESS_RESULT: readonly IndexNowSubmissionResult[] = [
    { engine: 'bing', succeeded: true, statusCode: 200 },
    { engine: 'yandex', succeeded: true, statusCode: 200 },
  ];

  function fakeIndexNow(
    submit: (input: IndexNowSubmissionInput) => Promise<readonly IndexNowSubmissionResult[]>,
  ): IndexNowNotifier {
    return { submit };
  }

  it('submits canonical URLs for a category.status_changed PUBLISHED transition when enabled', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({
      eventType: 'category.status_changed',
      payload: { newStatus: 'PUBLISHED', canonicalUrls: ['/en/catalog/chairs'] },
    });
    const submit = vi.fn().mockResolvedValue(SUCCESS_RESULT);

    await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings()),
      indexNowKey: 'a1b2c3d4e5f6',
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      host: 'eramix.example',
      key: 'a1b2c3d4e5f6',
      keyLocation: 'https://eramix.example/api/seo/indexnow-key.txt',
      urlList: ['https://eramix.example/en/catalog/chairs'],
    });
  });

  it('never submits when PlatformSettings.indexNowEnabled is false (live check, not cached)', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({
      eventType: 'product.status_changed',
      payload: { newStatus: 'PUBLISHED', canonicalUrls: ['/en/catalog/P8K4F2M9-oak-table'] },
    });
    const submit = vi.fn().mockResolvedValue(SUCCESS_RESULT);

    await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings({ indexNowEnabled: false })),
      indexNowKey: 'a1b2c3d4e5f6',
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it('never submits for an ineligible event type (e.g. order.submitted)', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({ eventType: 'order.submitted', payload: {} });
    const submit = vi.fn().mockResolvedValue(SUCCESS_RESULT);

    await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings()),
      indexNowKey: 'a1b2c3d4e5f6',
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it('never submits for a status_changed event that did not transition to PUBLISHED', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({
      eventType: 'content.status_changed',
      payload: { newStatus: 'ARCHIVED' },
    });
    const submit = vi.fn().mockResolvedValue(SUCCESS_RESULT);

    await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings()),
      indexNowKey: 'a1b2c3d4e5f6',
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it('never submits when the deployment secret (indexNowKey) is not configured', async () => {
    const outbox = new InMemoryOutbox();
    outbox.seed({
      eventType: 'category.status_changed',
      payload: { newStatus: 'PUBLISHED', canonicalUrls: ['/en/catalog/chairs'] },
    });
    const submit = vi.fn().mockResolvedValue(SUCCESS_RESULT);

    await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings()),
      // indexNowKey deliberately omitted
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it('an IndexNow submission failure never affects the outbox message SENT outcome (best-effort, not the source of truth)', async () => {
    const outbox = new InMemoryOutbox();
    const seeded = outbox.seed({
      eventType: 'category.status_changed',
      payload: { newStatus: 'PUBLISHED', canonicalUrls: ['/en/catalog/chairs'] },
    });
    const submit = vi.fn().mockRejectedValue(new Error('network unreachable'));

    const result = await processOutboxBatch({
      outbox,
      email: { send: () => Promise.resolve() },
      logger: fakeLogger(),
      clock: fixedClock(new Date()),
      indexNow: fakeIndexNow(submit),
      settingsRepo: fakeSettingsRepo(makePlatformSettings()),
      indexNowKey: 'a1b2c3d4e5f6',
    });

    expect(result.sent).toBe(1);
    expect(outbox.get(seeded.id)?.status).toBe('SENT');
  });
});
