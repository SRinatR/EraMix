'use client';

import type { AnalyticsConsentState, AnalyticsEventName, LocaleCode } from '@eramix/domain';
import { ANALYTICS_SCHEMA_VERSION } from '@eramix/domain';
import { getStoredConsent } from './consent-store';

/**
 * Client-side emission helper (CLAUDE.md: "Instrument a privacy-safe
 * product-interest event model from the first public release"). Reads the
 * real visitor choice recorded by consent-banner.tsx/consent-store.ts —
 * withheld for every category until a choice has actually been made (no
 * consent record on file, or one from a superseded policy version, both
 * read as withheld). Events are still captured/validated/enqueued end to
 * end even while withheld, but apps/worker's dispatchAnalyticsEvent will
 * never forward any of them to GA4/Yandex Metrica without a granted
 * category — the safe, privacy-by-default posture.
 */
function currentConsent(): AnalyticsConsentState {
  const stored = getStoredConsent();
  return stored
    ? { analytics: stored.analytics, advertising: stored.advertising }
    : { analytics: false, advertising: false };
}

const SESSION_STORAGE_KEY = 'eramix_analytics_session_id';

/**
 * A stable, anonymous per-browser-tab identifier — `sessionStorage`, never
 * a cookie, so no tracking identifier is ever set without consent
 * (CLAUDE.md: "stable IDs... rather than raw personal data").
 */
function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private-browsing/storage-disabled fallback: a per-call random ID is
    // still safe (just not stable across events in that tab), never PII.
    return crypto.randomUUID();
  }
}

interface AnalyticsEventFieldsBase {
  /** Every event carries the page context it fired from (schema v2) — pageType/canonicalPath are no longer page_view-only. */
  readonly pageType: string;
  readonly canonicalPath: string;
}

type AnalyticsEventFields = AnalyticsEventFieldsBase &
  (
    | { readonly eventName: 'page_view' }
    | { readonly eventName: 'view_item'; readonly productPublicId: string }
    | {
        readonly eventName: 'view_item_list';
        readonly categoryId?: string;
        readonly resultCount: number;
      }
    | { readonly eventName: 'search'; readonly categoryId?: string; readonly resultCount: number }
    | {
        readonly eventName: 'filter_used';
        readonly filterKey: string;
        readonly filterValue: string;
        readonly resultCount: number;
      }
    | { readonly eventName: 'generate_lead'; readonly productPublicId?: string }
    | { readonly eventName: 'lead_submitted'; readonly orderNumber: string }
    | { readonly eventName: 'contact_click'; readonly channel: string; readonly context: string }
    | {
        readonly eventName: 'file_download';
        readonly assetId: string;
        readonly productPublicId?: string;
      }
    | {
        readonly eventName: 'locale_changed';
        readonly fromLocale: string;
        readonly toLocale: string;
      }
  );

/**
 * Fire-and-forget: never throws, never blocks the caller's own UI flow
 * (CLAUDE.md: "non-blocking delivery"). A delivery failure here is not
 * actionable by the visitor and must never surface as a user-facing error.
 */
export function sendAnalyticsEvent(locale: LocaleCode, fields: AnalyticsEventFields): void {
  const event = {
    eventId: crypto.randomUUID(),
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    occurredAt: new Date().toISOString(),
    sessionId: getSessionId(),
    locale,
    consent: currentConsent(),
    ...fields,
  };
  void fetch('/api/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
    keepalive: true,
  }).catch(() => {
    // Best-effort; a network/ad-blocker failure here must never affect the page.
  });
}

export type { AnalyticsEventName };
