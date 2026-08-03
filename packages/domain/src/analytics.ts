import { ValidationFailedError } from './errors.js';
import { isSupportedLocale, type LocaleCode } from './locale.js';
import { isValidUuidV7 } from './uuidv7.js';

/**
 * CLAUDE.md's shared, versioned event library: "one semantic event to Rust
 * analytics, GA4 and Yandex Metrica adapters... external destinations may
 * not receive extra fields." This is the P0 event set named explicitly:
 * page_view, view_item, view_item_list, search, filter_used, generate_lead,
 * lead_submitted, contact_click, file_download, locale_changed.
 *
 * Every event is a closed, exhaustive discriminated union — there is no
 * free-text/arbitrary field anywhere a caller could smuggle PII into, which
 * is a stronger guarantee than detecting PII after the fact. Consent
 * travels *with* each event (Google Consent Mode's own pattern) since the
 * ingestion endpoint is anonymous/unauthenticated and cannot otherwise know
 * a visitor's choice.
 *
 * Schema v2 (bumped from v1): moves `pageType`/`canonicalPath` onto the
 * shared base — every event, not only `page_view`, now carries the page
 * context it fired from — and renames `rfq_start`→`generate_lead`,
 * `rfq_submit`→`lead_submitted`, generalizes `phone_click`→`contact_click`
 * (adds a `channel`), and adds `search`, `filter_used`, `file_download`,
 * `locale_changed`. This is a breaking shape change; safe because consent
 * has always been hardcoded to withheld (`{analytics: false, advertising:
 * false}` — no real consent UI exists yet, see analytics-client.ts), so no
 * event has ever actually reached a live provider.
 */

export const ANALYTICS_SCHEMA_VERSION = 2;

export interface AnalyticsConsentState {
  readonly analytics: boolean;
  readonly advertising: boolean;
}

export type PageType =
  'home' | 'category' | 'product' | 'article' | 'page' | 'faq' | 'catalog' | 'other';

interface AnalyticsEventBase {
  /** Client-generated UUID — the idempotency key a sink dedupes on. */
  readonly eventId: string;
  readonly schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  /** ISO 8601 — validated against a bounded clock-skew window, never trusted as-is. */
  readonly occurredAt: string;
  /** Anonymous, stable per browser-tab session — never a user identity, email, or persistent cross-session cookie. */
  readonly sessionId: string;
  readonly locale: LocaleCode;
  readonly pageType: PageType;
  /** Relative path only, e.g. `/en/catalog/chairs` — never a full origin (CLAUDE.md's URL-builder convention). */
  readonly canonicalPath: string;
  readonly consent: AnalyticsConsentState;
}

export type ContactClickContext = 'header' | 'footer' | 'contact_page' | 'product';
export type ContactChannel = 'phone' | 'email' | 'messenger';

export type AnalyticsEvent =
  | (AnalyticsEventBase & { readonly eventName: 'page_view' })
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
      /**
       * Deliberately never carries the raw search query — a free-text
       * search box is exactly the kind of field a visitor could type PII
       * into (search-visibility.md: "query class (not raw sensitive
       * input)"). Only the result count is measurable.
       */
      readonly eventName: 'search';
      readonly categoryId?: string | undefined;
      readonly resultCount: number;
    })
  | (AnalyticsEventBase & {
      /** A known facet identifier/value pair (e.g. availability, price band) — never raw free-text input; both fields are still bounded/PII-pattern-checked below. No filter-facet UI is wired to this event yet (schema/pipeline ready, no trigger). */
      readonly eventName: 'filter_used';
      readonly filterKey: string;
      readonly filterValue: string;
      readonly resultCount: number;
    })
  | (AnalyticsEventBase & {
      /** Inquiry/CTA initiation — renamed from rfq_start (schema v1). */
      readonly eventName: 'generate_lead';
      readonly productPublicId?: string | undefined;
    })
  | (AnalyticsEventBase & {
      /** The primary organic conversion (search-visibility.md: "the primary organic conversion"). Renamed from rfq_submit (schema v1). orderNumber is the public identifier — never the internal order UUID. */
      readonly eventName: 'lead_submitted';
      readonly orderNumber: string;
    })
  | (AnalyticsEventBase & {
      /** Generalizes phone_click (schema v1) to any contact channel. */
      readonly eventName: 'contact_click';
      readonly channel: ContactChannel;
      readonly context: ContactClickContext;
    })
  | (AnalyticsEventBase & {
      /** A document/CAD download — assetId is the internal ProductAsset id, never the original filename or storage key. */
      readonly eventName: 'file_download';
      readonly assetId: string;
      readonly productPublicId?: string | undefined;
    })
  | (AnalyticsEventBase & {
      readonly eventName: 'locale_changed';
      readonly fromLocale: LocaleCode;
      readonly toLocale: LocaleCode;
    });

export type AnalyticsEventName = AnalyticsEvent['eventName'];

const MAX_CLOCK_SKEW_FUTURE_MS = 60_000;
const MAX_CLOCK_SKEW_PAST_MS = 5 * 60_000;
/**
 * Case-insensitive on purpose: `productUrl()`/`orderUrl()` embed an
 * uppercase Crockford-base32 `publicId`/`orderNumber` segment (e.g.
 * `/en/catalog/P8K4F2M9-red-t-shirt`) — a lowercase-only pattern would
 * reject every real product/order canonicalPath. This was a latent,
 * never-triggered gap in schema v1 (canonicalPath was only ever required
 * on `page_view`, which was never wired to a product/order page); moving
 * canonicalPath onto the shared base in v2 (every event, not just
 * page_view) surfaced it.
 */
const CANONICAL_PATH_PATTERN = /^\/[A-Za-z0-9\-/]*$/;
const MAX_FILTER_FIELD_LENGTH = 100;
/** Defense in depth even though the schema has no free-text field: a client-supplied value must never carry a PII-shaped payload (query-string style or a bare value). */
const SUSPICIOUS_PII_PATTERN = /(^|[?&])(email|phone|password|token|card|ssn)=|@|^\+?\d{7,}$/i;

/**
 * Business-rule validation for an already-shape-checked event (the
 * discriminated-union shape itself is parsed/rejected at the delivery
 * boundary, matching every other domain module's "zod parses, this
 * package validates invariants" convention). Throws ValidationFailedError.
 */
export function validateAnalyticsEvent(event: AnalyticsEvent, now: Date): void {
  // ADR-0021: eventId must be a real UUIDv7 (generated client-side —
  // packages/domain/src/uuidv7.ts — never database-backed, since this event
  // is created in the browser before any request exists). A UUIDv4 (or any
  // other malformed/non-UUID value) is rejected, not merely an empty string.
  if (!isValidUuidV7(event.eventId)) {
    throw new ValidationFailedError('Analytics event eventId must be a valid UUIDv7.', {
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
  if (!CANONICAL_PATH_PATTERN.test(event.canonicalPath)) {
    throw new ValidationFailedError('Analytics event canonicalPath must be a bare relative path.', {
      canonicalPath: event.canonicalPath,
    });
  }
  if (SUSPICIOUS_PII_PATTERN.test(event.canonicalPath)) {
    throw new ValidationFailedError(
      'Analytics event canonicalPath must never carry a PII-shaped query parameter.',
      { canonicalPath: event.canonicalPath },
    );
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

  if (
    (event.eventName === 'view_item_list' || event.eventName === 'search') &&
    event.resultCount < 0
  ) {
    throw new ValidationFailedError(
      `Analytics ${event.eventName} resultCount must not be negative.`,
      {
        resultCount: event.resultCount,
      },
    );
  }
  if (event.eventName === 'filter_used') {
    if (event.resultCount < 0) {
      throw new ValidationFailedError('Analytics filter_used resultCount must not be negative.', {
        resultCount: event.resultCount,
      });
    }
    for (const [field, value] of [
      ['filterKey', event.filterKey],
      ['filterValue', event.filterValue],
    ] as const) {
      if (value.trim().length === 0 || value.length > MAX_FILTER_FIELD_LENGTH) {
        throw new ValidationFailedError(
          `Analytics filter_used ${field} must be 1-${MAX_FILTER_FIELD_LENGTH} characters.`,
          { field },
        );
      }
      if (SUSPICIOUS_PII_PATTERN.test(value)) {
        throw new ValidationFailedError(
          `Analytics filter_used ${field} must never carry a PII-shaped value.`,
          { field },
        );
      }
    }
  }
  if (event.eventName === 'locale_changed') {
    if (!isSupportedLocale(event.fromLocale) || !isSupportedLocale(event.toLocale)) {
      throw new ValidationFailedError('Analytics locale_changed requires two supported locales.', {
        fromLocale: event.fromLocale,
        toLocale: event.toLocale,
      });
    }
  }
}
