import type { AnalyticsEventLike } from '@eramix/application';
import { describe, expect, it, vi } from 'vitest';
import { Ga4EventSink } from './ga4-event-sink.js';

const CONTEXT = { canonicalOrigin: 'https://eramix.example', ga4MeasurementId: 'G-TEST123' };

const PAGE_VIEW: AnalyticsEventLike & { canonicalPath: string; pageType: string } = {
  eventId: 'evt-1',
  schemaVersion: 1,
  eventName: 'page_view',
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  consent: { analytics: true, advertising: false },
  canonicalPath: '/en/catalog/chairs',
  pageType: 'category',
};

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe('Ga4EventSink', () => {
  it('posts to the Measurement Protocol collect endpoint and reports success on 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(204));
    const sink = new Ga4EventSink({ apiSecret: 'secret-abc', fetchImpl });

    const result = await sink.dispatch(PAGE_VIEW, CONTEXT);

    expect(result).toEqual({ sink: 'ga4', succeeded: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('measurement_id=G-TEST123');
    expect(url).toContain('api_secret=secret-abc');
    const body = JSON.parse(init.body as string) as {
      client_id: string;
      events: { name: string; params: Record<string, unknown> }[];
    };
    expect(body.client_id).toBe('session-1');
    expect(body.events[0]?.name).toBe('page_view');
    expect(body.events[0]?.params['page_location']).toBe(
      'https://eramix.example/en/catalog/chairs',
    );
    expect(body.events[0]?.params['locale']).toBe('en');
  });

  it('declines to dispatch when ga4MeasurementId is not configured (live-checked, never a placeholder)', async () => {
    const fetchImpl = vi.fn();
    const sink = new Ga4EventSink({ apiSecret: 'secret-abc', fetchImpl });

    const result = await sink.dispatch(PAGE_VIEW, { canonicalOrigin: 'https://eramix.example' });

    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('ga4MeasurementId');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never includes the consent object or eventName duplicated as a raw field in params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(204));
    const sink = new Ga4EventSink({ apiSecret: 'secret-abc', fetchImpl });

    await sink.dispatch(PAGE_VIEW, CONTEXT);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      events: { params: Record<string, unknown> }[];
    };
    expect(body.events[0]?.params).not.toHaveProperty('consent');
    expect(body.events[0]?.params).not.toHaveProperty('sessionId');
  });

  it('retries a failing request up to maxAttempts, then reports failure without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const sink = new Ga4EventSink({
      apiSecret: 'secret-abc',
      fetchImpl,
      sleepImpl,
      maxAttempts: 3,
    });

    const result = await sink.dispatch(PAGE_VIEW, CONTEXT);

    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('500');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it('never throws even when fetch itself rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const sink = new Ga4EventSink({
      apiSecret: 'secret-abc',
      fetchImpl,
      sleepImpl: vi.fn().mockResolvedValue(undefined),
      maxAttempts: 1,
    });

    await expect(sink.dispatch(PAGE_VIEW, CONTEXT)).resolves.toMatchObject({
      succeeded: false,
      error: 'ECONNRESET',
    });
  });
});
