'use client';

import type { AnalyticsConsentState, AnalyticsEventName, LocaleCode } from '@eramix/domain';
import { ANALYTICS_SCHEMA_VERSION } from '@eramix/domain';

/**
 * Client-side emission helper (CLAUDE.md: "Instrument a privacy-safe
 * product-interest event model from the first public release"). Consent is
 * hardcoded to withheld for every category — this repository has no
 * cookie-consent-banner UI yet, so there is no real user choice to read.
 * Events are still captured/validated/enqueued end to end (proving the
 * whole pipeline genuinely works), but apps/worker's dispatchAnalyticsEvent
 * will never forward any of them to GA4/Yandex Metrica while consent is
 * withheld — the safe, privacy-by-default posture until a real consent
 * mechanism exists. See IMPLEMENTATION_ROADMAP.md's "not yet built" note
 * for this slice.
 */
function currentConsent(): AnalyticsConsentState {
  return { analytics: false, advertising: false };
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

type AnalyticsEventFields =
  | { readonly eventName: 'page_view'; readonly pageType: string; readonly canonicalPath: string }
  | { readonly eventName: 'view_item'; readonly productPublicId: string }
  | {
      readonly eventName: 'view_item_list';
      readonly categoryId?: string;
      readonly resultCount: number;
    }
  | { readonly eventName: 'rfq_start'; readonly productPublicId?: string }
  | { readonly eventName: 'rfq_submit'; readonly orderNumber: string }
  | { readonly eventName: 'phone_click'; readonly context: string };

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
