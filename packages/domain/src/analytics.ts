import { ValidationFailedError } from './errors.js';
import { isSupportedLocale, type LocaleCode } from './locale.js';

/**
 * CLAUDE.md/docs/runbooks/search-visibility.md's shared, versioned event
 * library: "one semantic event to Rust analytics, GA4 and Yandex Metrica
 * adapters... external destinations may not receive extra fields." This is
 * the P0 event set the runbook names explicitly (line 453-454): page_view,
 * view_item, view_item_list, inquiry/CTA initiation (rfq_start),
 * rfq_submit, and telephone click. P1 events (document download, CAD
 * request, email click, language switch) are a later slice.
 *
 * Every event is a closed, exhaustive discriminated union — there is no
 * free-text/arbitrary field anywhere a caller could smuggle PII into, which
 * is a stronger guarantee than detecting PII after the fact. Consent
 * travels *with* each event (Google Consent Mode's own pattern) since the
 * ingestion endpoint is anonymous/unauthenticated and cannot otherwise know
 * a visitor's choice.
 */

export const ANALYTICS_SCHEMA_VERSION = 1;

export interface AnalyticsConsentState {
  readonly analytics: boolean;
  readonly advertising: boolean;
}

interface AnalyticsEventBase {
  /** Client-generated UUID — the idempotency key a sink dedupes on. */
  readonly eventId: string;
  readonly schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  /** ISO 8601 — validated against a bounded clock-skew window, never trusted as-is. */
  readonly occurredAt: string;
  /** Anonymous, stable per browser-tab session — never a user identity, email, or persistent cross-session cookie. */
  readonly sessionId: string;
  readonly locale: LocaleCode;
  readonly consent: AnalyticsConsentState;
}

export type PageType =
  'home' | 'category' | 'product' | 'article' | 'page' | 'faq' | 'catalog' | 'other';

export type PhoneClickContext = 'header' | 'footer' | 'contact_page' | 'product';

export type AnalyticsEvent =
  | (AnalyticsEventBase & {
      readonly eventName: 'page_view';
      readonly pageType: PageType;
      /** Relative path only, e.g. `/en/catalog/chairs` — never a full origin (CLAUDE.md's URL-builder convention). */
      readonly canonicalPath: string;
    })
  | (AnalyticsEventBase & {
      readonly eventName: 'view_item';
      readonly productPublicId: string;
    })
  | (AnalyticsEventBase & {
      readonly eventName: 'view_item_list';
      readonly categoryId?: string | undefined;
      readonly resultCount: number;
    })
  | (AnalyticsEventBase & {
      readonly eventName: 'rfq_start';
      readonly productPublicId?: string | undefined;
    })
  | (AnalyticsEventBase & {
      /** The primary organic conversion (search-visibility.md: "Measure rfq_submit as the primary organic conversion"). orderNumber is the public identifier — never the internal order UUID. */
      readonly eventName: 'rfq_submit';
      readonly orderNumber: string;
    })
  | (AnalyticsEventBase & {
      readonly eventName: 'phone_click';
      readonly context: PhoneClickContext;
    });

export type AnalyticsEventName = AnalyticsEvent['eventName'];

const MAX_CLOCK_SKEW_FUTURE_MS = 60_000;
const MAX_CLOCK_SKEW_PAST_MS = 5 * 60_000;
const CANONICAL_PATH_PATTERN = /^\/[a-z0-9\-/]*$/;
/** Defense in depth even though the schema has no free-text field: a client-supplied path must never carry a query string (which could carry PII the client injected). */
const SUSPICIOUS_QUERY_PATTERN = /[?&](email|phone|password|token|card|ssn)=/i;

/**
 * Business-rule validation for an already-shape-checked event (the
 * discriminated-union shape itself is parsed/rejected at the delivery
 * boundary, matching every other domain module's "zod parses, this
 * package validates invariants" convention). Throws ValidationFailedError.
 */
export function validateAnalyticsEvent(event: AnalyticsEvent, now: Date): void {
  if (event.eventId.trim().length === 0) {
    throw new ValidationFailedError('Analytics event requires a non-empty eventId.', {
      eventName: event.eventName,
    });
  }
  if (event.schemaVersion !== ANALYTICS_SCHEMA_VERSION) {
    throw new ValidationFailedError(
      `Unsupported analytics event schemaVersion ${String(event.schemaVersion)}.`,
      { eventName: event.eventName, schemaVersion: event.schemaVersion },
    );
  }
  if (!isSupportedLocale(event.locale)) {
    throw new ValidationFailedError(`Analytics event locale "${event.locale}" is not supported.`, {
      eventName: event.eventName,
    });
  }
  if (event.sessionId.trim().length === 0 || event.sessionId.length > 128) {
    throw new ValidationFailedError('Analytics event sessionId must be 1-128 characters.', {
      eventName: event.eventName,
    });
  }
  const occurredAtMs = Date.parse(event.occurredAt);
  if (Number.isNaN(occurredAtMs)) {
    throw new ValidationFailedError(
      'Analytics event occurredAt is not a valid ISO 8601 timestamp.',
      {
        eventName: event.eventName,
        occurredAt: event.occurredAt,
      },
    );
  }
  const deltaMs = occurredAtMs - now.getTime();
  if (deltaMs > MAX_CLOCK_SKEW_FUTURE_MS || deltaMs < -MAX_CLOCK_SKEW_PAST_MS) {
    throw new ValidationFailedError(
      'Analytics event occurredAt is outside the accepted clock-skew window.',
      {
        eventName: event.eventName,
        occurredAt: event.occurredAt,
      },
    );
  }

  if (event.eventName === 'page_view') {
    if (!CANONICAL_PATH_PATTERN.test(event.canonicalPath)) {
      throw new ValidationFailedError(
        'Analytics page_view canonicalPath must be a bare relative path.',
        {
          canonicalPath: event.canonicalPath,
        },
      );
    }
    if (SUSPICIOUS_QUERY_PATTERN.test(event.canonicalPath)) {
      throw new ValidationFailedError(
        'Analytics page_view canonicalPath must never carry a PII-shaped query parameter.',
        { canonicalPath: event.canonicalPath },
      );
    }
  }
  if (event.eventName === 'view_item_list' && event.resultCount < 0) {
    throw new ValidationFailedError('Analytics view_item_list resultCount must not be negative.', {
      resultCount: event.resultCount,
    });
  }
}
