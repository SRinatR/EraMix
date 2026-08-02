import type { AnalyticsEventLike } from '@eramix/application';
import { describe, expect, it } from 'vitest';
import { RustAnalyticsEventSink } from './rust-analytics-event-sink.js';

const EVENT: AnalyticsEventLike = {
  eventId: 'evt-1',
  schemaVersion: 1,
  eventName: 'page_view',
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  consent: { analytics: true, advertising: false },
};

describe('RustAnalyticsEventSink', () => {
  it('never dispatches anything — always reports a clear not-yet-available result', async () => {
    const sink = new RustAnalyticsEventSink();
    const result = await sink.dispatch(EVENT, { canonicalOrigin: 'https://eramix.example' });
    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('not yet available');
  });
});
