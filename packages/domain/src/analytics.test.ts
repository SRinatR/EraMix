import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { ANALYTICS_SCHEMA_VERSION, validateAnalyticsEvent } from './analytics.js';
import type { AnalyticsEvent } from './analytics.js';
import { generateUuidV7 } from './uuidv7.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const CONSENT_GRANTED = { analytics: true, advertising: false };

function pageView(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: generateUuidV7(),
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    occurredAt: NOW.toISOString(),
    sessionId: 'session-1',
    locale: 'en',
    pageType: 'product',
    canonicalPath: '/en/catalog/p8k4f2m9-red-t-shirt',
    consent: CONSENT_GRANTED,
    eventName: 'page_view',
    ...overrides,
  } as AnalyticsEvent;
}

describe('validateAnalyticsEvent', () => {
  it('accepts a well-formed page_view event', () => {
    expect(() => validateAnalyticsEvent(pageView(), NOW)).not.toThrow();
  });

  it('accepts a well-formed lead_submitted event (the primary organic conversion)', () => {
    const event: AnalyticsEvent = {
      eventId: generateUuidV7(),
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt: NOW.toISOString(),
      sessionId: 'session-1',
      locale: 'ru',
      pageType: 'other',
      canonicalPath: '/ru/account/orders/ORD-ABC123',
      consent: CONSENT_GRANTED,
      eventName: 'lead_submitted',
      orderNumber: 'ORD-ABC123',
    };
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('rejects an empty eventId', () => {
    expect(() => validateAnalyticsEvent(pageView({ eventId: '' }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a malformed/non-UUID eventId', () => {
    expect(() => validateAnalyticsEvent(pageView({ eventId: 'not-a-uuid' }), NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a syntactically valid UUID that is the wrong version (UUIDv4, not UUIDv7)', () => {
    expect(() =>
      validateAnalyticsEvent(pageView({ eventId: '3f8e1c2a-4b5d-4e6f-8a9b-0c1d2e3f4a5b' }), NOW),
    ).toThrow(ValidationFailedError);
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(() =>
      validateAnalyticsEvent(
        pageView({ schemaVersion: 1 as typeof ANALYTICS_SCHEMA_VERSION }),
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

  it('requires pageType/canonicalPath on every event, not only page_view', () => {
    const event: AnalyticsEvent = {
      eventId: generateUuidV7(),
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt: NOW.toISOString(),
      sessionId: 'session-1',
      locale: 'en',
      pageType: 'catalog',
      canonicalPath: '/en/catalog/chairs',
      consent: CONSENT_GRANTED,
      eventName: 'view_item_list',
      resultCount: 3,
    };
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('rejects a negative view_item_list resultCount', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'catalog', canonicalPath: '/en/catalog/chairs' }),
      eventName: 'view_item_list',
      resultCount: -1,
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
  });

  it('rejects a negative search resultCount and never carries a raw query string field', () => {
    const event = {
      ...pageView({ pageType: 'catalog', canonicalPath: '/en/catalog/chairs' }),
      eventName: 'search',
      resultCount: -1,
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
    expect(event).not.toHaveProperty('query');
    expect(event).not.toHaveProperty('searchTerm');
  });

  it('accepts a well-formed filter_used event', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'catalog', canonicalPath: '/en/catalog/chairs' }),
      eventName: 'filter_used',
      filterKey: 'availability',
      filterValue: 'in_stock',
      resultCount: 4,
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('rejects a blank filter_used filterKey/filterValue', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'catalog', canonicalPath: '/en/catalog/chairs' }),
      eventName: 'filter_used',
      filterKey: '   ',
      filterValue: 'in_stock',
      resultCount: 4,
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
  });

  it('rejects a PII-shaped filter_used filterValue (defense in depth)', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'catalog', canonicalPath: '/en/catalog/chairs' }),
      eventName: 'filter_used',
      filterKey: 'contact',
      filterValue: 'someone@example.com',
      resultCount: 4,
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
  });

  it('accepts a well-formed contact_click event with a channel and context', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'other', canonicalPath: '/en/pages/contacts' }),
      eventName: 'contact_click',
      channel: 'phone',
      context: 'contact_page',
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('accepts a well-formed file_download event', () => {
    const event: AnalyticsEvent = {
      ...pageView({ pageType: 'product', canonicalPath: '/en/catalog/p8k4f2m9-red-t-shirt' }),
      eventName: 'file_download',
      assetId: 'asset-1',
      productPublicId: 'P8K4F2M9',
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('accepts a well-formed locale_changed event', () => {
    const event: AnalyticsEvent = {
      ...pageView(),
      eventName: 'locale_changed',
      fromLocale: 'en',
      toLocale: 'ru',
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('rejects a locale_changed event naming an unsupported locale', () => {
    const event = {
      ...pageView(),
      eventName: 'locale_changed',
      fromLocale: 'en',
      toLocale: 'fr',
    } as unknown as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).toThrow(ValidationFailedError);
  });

  it('accepts a well-formed generate_lead event (renamed from rfq_start)', () => {
    const event: AnalyticsEvent = {
      ...pageView(),
      eventName: 'generate_lead',
      productPublicId: 'P8K4F2M9',
    } as AnalyticsEvent;
    expect(() => validateAnalyticsEvent(event, NOW)).not.toThrow();
  });

  it('accepts consent withheld — validation is structural, consent gating happens downstream', () => {
    expect(() =>
      validateAnalyticsEvent(pageView({ consent: { analytics: false, advertising: false } }), NOW),
    ).not.toThrow();
  });
});
