import { ANALYTICS_SCHEMA_VERSION, SUPPORTED_LOCALES } from '@eramix/domain';
import { z } from 'zod';

/**
 * The HTTP-boundary shape check for POST /api/analytics/events. Every
 * variant is `.strict()` — an unknown/extra field is rejected outright
 * (never silently dropped), so a client can never smuggle an arbitrary
 * field (e.g. an email address) through undetected. Business-rule
 * validation (clock skew, canonicalPath shape) is packages/domain/src/
 * analytics.ts's job; this only establishes the closed shape.
 */
const consentSchema = z.object({ analytics: z.boolean(), advertising: z.boolean() }).strict();

const pageTypeSchema = z.enum([
  'home',
  'category',
  'product',
  'article',
  'page',
  'faq',
  'catalog',
  'other',
]);

/**
 * Schema v2: pageType/canonicalPath moved onto the shared base — every
 * event, not only page_view, now carries the page context it fired from.
 */
const baseFields = {
  eventId: z.string().min(1).max(128),
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
  occurredAt: z.string().min(1),
  sessionId: z.string().min(1).max(128),
  locale: z.enum(SUPPORTED_LOCALES),
  pageType: pageTypeSchema,
  canonicalPath: z.string().min(1).max(2048),
  consent: consentSchema,
};

export const analyticsEventSchema = z.discriminatedUnion('eventName', [
  z.object({ ...baseFields, eventName: z.literal('page_view') }).strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('view_item'),
      productPublicId: z.string().min(1).max(64),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('view_item_list'),
      categoryId: z.string().min(1).max(64).optional(),
      resultCount: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('search'),
      categoryId: z.string().min(1).max(64).optional(),
      resultCount: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('filter_used'),
      filterKey: z.string().min(1).max(100),
      filterValue: z.string().min(1).max(100),
      resultCount: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('generate_lead'),
      productPublicId: z.string().min(1).max(64).optional(),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('lead_submitted'),
      orderNumber: z.string().min(1).max(64),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('contact_click'),
      channel: z.enum(['phone', 'email', 'messenger']),
      context: z.enum(['header', 'footer', 'contact_page', 'product']),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('file_download'),
      assetId: z.string().min(1).max(64),
      productPublicId: z.string().min(1).max(64).optional(),
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventName: z.literal('locale_changed'),
      fromLocale: z.enum(SUPPORTED_LOCALES),
      toLocale: z.enum(SUPPORTED_LOCALES),
    })
    .strict(),
]);

export const MAX_ANALYTICS_EVENT_BATCH_SIZE = 20;

export const analyticsEventsRequestSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(MAX_ANALYTICS_EVENT_BATCH_SIZE),
});
