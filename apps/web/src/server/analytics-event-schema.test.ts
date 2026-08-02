import { describe, expect, it } from 'vitest';
import { analyticsEventSchema, analyticsEventsRequestSchema } from './analytics-event-schema.js';

const VALID_PAGE_VIEW = {
  eventId: 'evt-1',
  schemaVersion: 1,
  occurredAt: '2026-08-03T12:00:00Z',
  sessionId: 'session-1',
  locale: 'en',
  consent: { analytics: true, advertising: false },
  eventName: 'page_view',
  pageType: 'product',
  canonicalPath: '/en/catalog/chairs',
};

describe('analyticsEventSchema', () => {
  it('accepts a well-formed page_view event', () => {
    expect(analyticsEventSchema.safeParse(VALID_PAGE_VIEW).success).toBe(true);
  });

  it('accepts a well-formed rfq_submit event', () => {
    const result = analyticsEventSchema.safeParse({
      eventId: 'evt-2',
      schemaVersion: 1,
      occurredAt: '2026-08-03T12:00:00Z',
      sessionId: 'session-1',
      locale: 'ru',
      consent: { analytics: true, advertising: false },
      eventName: 'rfq_submit',
      orderNumber: 'ORD-ABC123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown eventName (not in the closed allowlist)', () => {
    expect(
      analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, eventName: 'user_login' }).success,
    ).toBe(false);
  });

  it('rejects an extra/unexpected field a client tried to smuggle in (strict schema, PII rejection)', () => {
    const result = analyticsEventSchema.safeParse({
      ...VALID_PAGE_VIEW,
      email: 'someone@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payment/token-shaped field on any event variant', () => {
    const result = analyticsEventSchema.safeParse({
      ...VALID_PAGE_VIEW,
      eventName: 'rfq_submit',
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
    expect(analyticsEventSchema.safeParse({ ...VALID_PAGE_VIEW, schemaVersion: 2 }).success).toBe(
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
