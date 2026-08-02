import { ValidationFailedError } from '@eramix/domain';
import type { AnalyticsEvent, PlatformSettings } from '@eramix/domain';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsDispatchResult, AnalyticsEventSink, Clock } from './ports.js';
import type { OutboxMessageRepository, PlatformSettingsRepository } from './repositories.js';
import { dispatchAnalyticsEvent, recordAnalyticsEvents } from './analytics.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const CONSENT_GRANTED = { analytics: true, advertising: false };

function pageView(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: NOW.toISOString(),
    sessionId: 'session-1',
    locale: 'en',
    consent: CONSENT_GRANTED,
    eventName: 'page_view',
    pageType: 'product',
    canonicalPath: '/en/catalog/p8k4f2m9-red-t-shirt',
    ...overrides,
  } as AnalyticsEvent;
}

function fixedClock(): Clock {
  return { now: () => NOW };
}

describe('recordAnalyticsEvents', () => {
  it('enqueues one outbox message per valid event', async () => {
    const enqueue = vi.fn().mockResolvedValue({});
    const outboxRepo = { enqueue } as unknown as OutboxMessageRepository;

    await recordAnalyticsEvents({ outboxRepo, clock: fixedClock() }, [
      pageView(),
      pageView({ eventId: 'evt-2' }),
    ]);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        aggregateType: 'AnalyticsEvent',
        aggregateId: 'evt-1',
        eventType: 'analytics.event_captured',
      }),
    );
  });

  it('rejects the whole batch (enqueues nothing) when any event is invalid', async () => {
    const enqueue = vi.fn().mockResolvedValue({});
    const outboxRepo = { enqueue } as unknown as OutboxMessageRepository;

    await expect(
      recordAnalyticsEvents({ outboxRepo, clock: fixedClock() }, [
        pageView(),
        pageView({ eventId: '' }),
      ]),
    ).rejects.toThrow(ValidationFailedError);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

function makeSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
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
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function fakeSink(
  name: string,
  requiredConsent: 'analytics' | 'advertising',
): AnalyticsEventSink & { dispatch: ReturnType<typeof vi.fn> } {
  return {
    name,
    requiredConsent,
    dispatch: vi
      .fn()
      .mockResolvedValue({ sink: name, succeeded: true } satisfies AnalyticsDispatchResult),
  };
}

describe('dispatchAnalyticsEvent', () => {
  it('never calls a sink when the event withholds that sink-required consent category', async () => {
    const ga4 = fakeSink('ga4', 'analytics');
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ ga4Enabled: true })),
    } as unknown as PlatformSettingsRepository;

    const results = await dispatchAnalyticsEvent(
      { sinks: [ga4], settingsRepo },
      pageView({ consent: { analytics: false, advertising: false } }),
    );

    expect(ga4.dispatch).not.toHaveBeenCalled();
    expect(results).toEqual([{ sink: 'ga4', succeeded: false, skipped: true }]);
  });

  it('never calls a sink the admin has not enabled, even with consent granted', async () => {
    const ga4 = fakeSink('ga4', 'analytics');
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ ga4Enabled: false })),
    } as unknown as PlatformSettingsRepository;

    const results = await dispatchAnalyticsEvent(
      { sinks: [ga4], settingsRepo },
      pageView({ consent: { analytics: true, advertising: false } }),
    );

    expect(ga4.dispatch).not.toHaveBeenCalled();
    expect(results[0]?.skipped).toBe(true);
  });

  it('calls a sink only when both consent and admin enablement agree', async () => {
    const ga4 = fakeSink('ga4', 'analytics');
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ ga4Enabled: true })),
    } as unknown as PlatformSettingsRepository;
    const event = pageView({ consent: { analytics: true, advertising: false } });

    const results = await dispatchAnalyticsEvent({ sinks: [ga4], settingsRepo }, event);

    expect(ga4.dispatch).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ canonicalOrigin: 'https://eramix.example' }),
    );
    expect(results).toEqual([{ sink: 'ga4', succeeded: true }]);
  });

  it('gates each sink independently by its own required consent category', async () => {
    const ga4 = fakeSink('ga4', 'analytics');
    const adsRemarketing = fakeSink('google_ads_remarketing', 'advertising');
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ ga4Enabled: true })),
    } as unknown as PlatformSettingsRepository;
    // Advertising consent withheld, analytics granted.
    const event = pageView({ consent: { analytics: true, advertising: false } });

    const results = await dispatchAnalyticsEvent(
      { sinks: [ga4, adsRemarketing], settingsRepo },
      event,
    );

    expect(ga4.dispatch).toHaveBeenCalled();
    expect(adsRemarketing.dispatch).not.toHaveBeenCalled();
    expect(results.find((r) => r.sink === 'google_ads_remarketing')?.skipped).toBe(true);
  });

  it('a failing sink never affects another sink (parity — one delivery failure is isolated)', async () => {
    const ga4 = fakeSink('ga4', 'analytics');
    ga4.dispatch.mockResolvedValue({ sink: 'ga4', succeeded: false, error: 'network error' });
    const yandex = fakeSink('yandex_metrica', 'analytics');
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ ga4Enabled: true, yandexMetricaEnabled: true })),
    } as unknown as PlatformSettingsRepository;
    const event = pageView({ consent: { analytics: true, advertising: false } });

    const results = await dispatchAnalyticsEvent({ sinks: [ga4, yandex], settingsRepo }, event);

    expect(results.find((r) => r.sink === 'ga4')?.succeeded).toBe(false);
    expect(results.find((r) => r.sink === 'yandex_metrica')?.succeeded).toBe(true);
    expect(yandex.dispatch).toHaveBeenCalled();
  });

  it('returns an empty result set when no sinks are registered', async () => {
    const settingsRepo = {
      get: () => {
        throw new Error('should not be called when there are no sinks');
      },
    } as unknown as PlatformSettingsRepository;

    const results = await dispatchAnalyticsEvent({ sinks: [], settingsRepo }, pageView());
    expect(results).toEqual([]);
  });
});
