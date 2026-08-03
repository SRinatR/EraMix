import { describe, expect, it } from 'vitest';
import { analyticsEventSchema, analyticsEventsRequestSchema } from './analytics-event-schema.js';

const VALID_PAGE_VIEW = {
  eventId: 'evt-1',
  schemaVersion: 2,
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  pageType: 'product',
  canonicalPath: '/en/catalog/chairs',
  consent: { analytics: true, advertising: false },
  eventName: 'page_view',
};

describe('analyticsEventSchema', () => {
  it('accepts a well-formed page_view event', () => {
    expect(analyticsEventSchema.safeParse(VALID_PAGE_VIEW).success).toBe(true);
  });

  it('accepts a well-formed lead_submitted event', () => {
    const result = analyticsEventSchema.safeParse({
      ...VALID_PAGE_VIEW,
      eventId: 'evt-2',
      locale: 'ru',
      eventName: 'lead_submitted',
      orderNumber: 'ORD-ABC123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a well-formed generate_lead event', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'generate_lead',
        productPublicId: 'P8K4F2M9',
      }).success,
    ).toBe(true);
  });

  it('accepts generate_lead with no productPublicId (optional field)', () => {
    expect(
      analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, eventName: 'generate_lead' }).success,
    ).toBe(true);
  });

  it('accepts a well-formed search event and rejects a raw query field on it', () => {
    const valid = {
      ...VALID_PAGE_VIEW,
      eventName: 'search',
      resultCount: 3,
    };
    expect(analyticsEventSchema.safeParse(valid).success).toBe(true);
    expect(analyticsEventSchema.safeParse({ ...valid, query: 'someone@example.com' }).success).toBe(
      false,
    );
  });

  it('accepts a well-formed filter_used event', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'filter_used',
        filterKey: 'availability',
        filterValue: 'in_stock',
        resultCount: 4,
      }).success,
    ).toBe(true);
  });

  it('accepts a well-formed contact_click event with a channel', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'contact_click',
        channel: 'phone',
        context: 'contact_page',
      }).success,
    ).toBe(true);
  });

  it('rejects contact_click with an unknown channel', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'contact_click',
        channel: 'carrier_pigeon',
        context: 'contact_page',
      }).success,
    ).toBe(false);
  });

  it('accepts a well-formed file_download event', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'file_download',
        assetId: 'asset-1',
      }).success,
    ).toBe(true);
  });

  it('accepts a well-formed locale_changed event', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'locale_changed',
        fromLocale: 'en',
        toLocale: 'ru',
      }).success,
    ).toBe(true);
  });

  it('rejects a locale_changed event naming an unsupported locale', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        eventName: 'locale_changed',
        fromLocale: 'en',
        toLocale: 'fr',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown eventName (not in the closed allowlist)', () => {
    expect(
      analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, eventName: 'user_login' }).success,
    ).toBe(false);
  });

  it('rejects a page_view missing the now-shared pageType/canonicalPath base fields', () => {
    const { pageType, ...withoutPageType } = VALID_PAGE_VIEW;
    void pageType;
    expect(analyticsEventSchema.safeParse(withoutPageType).success).toBe(false);
  });

  it('rejects an extra/unexpected field a client tried to smuggle in (strict schema, PII rejection)', () => {
    const result = analyticsEventSchema.safeParse({
      ...VALID_PAGE_VIEW,
      email: 'someone@example.com',
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ['name', 'Jane Doe'],
    ['email', 'someone@example.com'],
    ['phone', '+15551234567'],
    ['password', 'hunter2'],
    ['authorization', 'Bearer abc.def.ghi'],
    ['ipAddress', '203.0.113.5'],
    ['sessionToken', 'abc123'],
  ])('rejects a %s field smuggled onto any event variant', (field, value) => {
    const result = analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, [field]: value });
    expect(result.success).toBe(false);
  });

  it('rejects a payment/token-shaped field on any event variant', () => {
    const result = analyticsEventSchema.safeParse({
      ...VALID_PAGE_VIEW,
      eventName: 'lead_submitted',
      orderNumber: 'ORD-ABC123',
      creditCardNumber: '4111111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects consent as a non-boolean or with an extra field', () => {
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        consent: { analytics: 'yes', advertising: false },
      }).success,
    ).toBe(false);
    expect(
      analyticsEventSchema.safeParse({
        ...VALID_PAGE_VIEW,
        consent: { analytics: true, advertising: false, marketing: true },
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    expect(analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, locale: 'fr' }).success).toBe(
      false,
    );
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, schemaVersion: 1 }).success).toBe(
      false,
    );
  });
});

describe('analyticsEventsRequestSchema', () => {
  it('accepts a batch of 1-20 events', () => {
    expect(analyticsEventsRequestSchema.safeParse({ events: [VALID_PAGE_VIEW] }).success).toBe(
      true,
    );
  });

  it('rejects an empty batch', () => {
    expect(analyticsEventsRequestSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it('rejects a batch exceeding the maximum size', () => {
    const events = Array.from({ length: 21 }, (_, i) => ({
      ...VALID_PAGE_VIEW,
      eventId: `evt-${i}`,
    }));
    expect(analyticsEventsRequestSchema.safeParse({ events }).success).toBe(false);
  });
});
