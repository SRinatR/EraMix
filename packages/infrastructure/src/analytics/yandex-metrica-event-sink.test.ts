import type { AnalyticsEventLike } from '@eramix/application';
import { describe, expect, it, vi } from 'vitest';
import { YandexMetricaEventSink } from './yandex-metrica-event-sink.js';

const CONTEXT = { canonicalOrigin: 'https://eramix.example', yandexMetricaCounterId: '12345678' };

const PAGE_VIEW: AnalyticsEventLike = {
  eventId: 'evt-1',
  schemaVersion: 2,
  eventName: 'page_view',
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  pageType: 'category',
  canonicalPath: '/en/catalog/chairs',
  consent: { analytics: true, advertising: false },
};

const LEAD_SUBMITTED: AnalyticsEventLike & { orderNumber: string } = {
  eventId: 'evt-2',
  schemaVersion: 2,
  eventName: 'lead_submitted',
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  pageType: 'other',
  canonicalPath: '/en/account/orders/ORD-ABC123',
  consent: { analytics: true, advertising: false },
  orderNumber: 'ORD-ABC123',
};

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe('YandexMetricaEventSink', () => {
  it('reports a page_view hit to the watch-pixel endpoint using the passed canonical origin/counterId', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200));
    const sink = new YandexMetricaEventSink({ fetchImpl });

    const result = await sink.dispatch(PAGE_VIEW, CONTEXT);

    expect(result).toEqual({ sink: 'yandex_metrica', succeeded: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('mc.yandex.ru/watch/12345678');
    expect(url).toContain(encodeURIComponent('https://eramix.example/en/catalog/chairs'));
  });

  it('declines to dispatch when yandexMetricaCounterId is not configured (live-checked, never a placeholder)', async () => {
    const fetchImpl = vi.fn();
    const sink = new YandexMetricaEventSink({ fetchImpl });

    const result = await sink.dispatch(PAGE_VIEW, { canonicalOrigin: 'https://eramix.example' });

    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('yandexMetricaCounterId');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never sends a hardcoded/fabricated host — the origin always comes from the passed context', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200));
    const sink = new YandexMetricaEventSink({ fetchImpl });

    await sink.dispatch(PAGE_VIEW, {
      canonicalOrigin: 'https://staging.eramix.example',
      yandexMetricaCounterId: '12345678',
    });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent('https://staging.eramix.example/en/catalog/chairs'));
  });

  it('explicitly declines an unsupported event type instead of fabricating a request', async () => {
    const fetchImpl = vi.fn();
    const sink = new YandexMetricaEventSink({ fetchImpl });

    const result = await sink.dispatch(LEAD_SUBMITTED, CONTEXT);

    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('not yet supported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries a failing request up to maxAttempts, then reports failure without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const sink = new YandexMetricaEventSink({ fetchImpl, sleepImpl, maxAttempts: 3 });

    const result = await sink.dispatch(PAGE_VIEW, CONTEXT);

    expect(result.succeeded).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });
});
