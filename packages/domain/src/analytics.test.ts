import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { ANALYTICS_SCHEMA_VERSION, validateAnalyticsEvent } from './analytics.js';
import type { AnalyticsEvent } from './analytics.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const CONSENT_GRANTED = { analytics: true, advertising: false };

function pageView(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
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

describe('validateAnalyticsEvent', () => {
  it('accepts a well-formed page_view event', () => {
    expect(() => validateAnalyticsEvent(pageView(), NOW)).not.toThrow();
  });

  it('accepts a well-formed rfq_submit event (the primary organic conversion)', () => {
    const event: AnalyticsEvent = {
      eventId: 'evt-2',
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt: NOW.toISOString(),
      sessionId: 'session-1',
      locale: 'ru',
      consent: CONSENT_GRANTED,
      eventName: 'rfq_submit',
      orderNumber: 'ORD-ABC123',
    };
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('rejects an empty eventId', () => {
    expect(() => validateAnalyticsEvent(pageView({ eventId: '' }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(() =>
      validateAnalyticsEvent(
        pageView({ schemaVersion: 2 as typeof ANALYTICS_SCHEMA_VERSION }),
        NOW,
      ),
    ).toThrow(ValidationFailedError);
  });

  it('rejects an unsupported locale', () => {
    expect(() => validateAnalyticsEvent(pageView({ locale: 'fr' as never }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects an empty sessionId', () => {
    expect(() => validateAnalyticsEvent(pageView({ sessionId: '' }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a malformed occurredAt', () => {
    expect(() => validateAnalyticsEvent(pageView({ occurredAt: 'not-a-date' }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects an event timestamped too far in the future (clock skew / tampering)', () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(() => validateAnalyticsEvent(pageView({ occurredAt: future }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects an event timestamped too far in the past (stale replay)', () => {
    const past = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(() => validateAnalyticsEvent(pageView({ occurredAt: past }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a canonicalPath that is not a bare relative path', () => {
    expect(() =>
      validateAnalyticsEvent(pageView({ canonicalPath: 'https://evil.example/x' }), NOW),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a canonicalPath carrying a PII-shaped query parameter (defense in depth)', () => {
    expect(() =>
      validateAnalyticsEvent(
        pageView({ canonicalPath: '/en/contact?email=someone@example.com' }),
        NOW,
      ),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a negative view_item_list resultCount', () => {
    const event: AnalyticsEvent = {
      eventId: 'evt-3',
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt: NOW.toISOString(),
      sessionId: 'session-1',
      locale: 'en',
      consent: CONSENT_GRANTED,
      eventName: 'view_item_list',
      resultCount: -1,
    };
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
  });

  it('accepts consent withheld — validation is structural, consent gating happens downstream', () => {
    expect(() =>
      validateAnalyticsEvent(pageView({ consent: { analytics: false, advertising: false } }), NOW),
    ).not.toThrow();
  });
});
