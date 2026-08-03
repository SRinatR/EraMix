/**
 * The real consent primitive (CLAUDE.md: "Implement a real consent UI/state
 * and enforce it before every non-essential analytics provider loads or
 * receives an event"). Pure, framework-free — the actual storage (a cookie,
 * apps/web/src/components/consent-store.ts) and UI (consent-banner.tsx) are
 * delivery-layer concerns; this module only defines the shape and the
 * versioning rule every layer agrees on.
 *
 * Essential/operational telemetry (structured JSON logs, OpenTelemetry
 * traces — apps/web/src/server/handler.ts's JsonLogger) is a completely
 * separate code path and is never gated by this consent state (CLAUDE.md:
 * "Essential security/operational telemetry remains separate from
 * marketing analytics").
 */

/**
 * Bump when the consent *policy* materially changes (a new category is
 * added, wording changes enough to need re-consent) — never for a routine
 * code change. A stored record whose version does not match is treated as
 * absent, so the banner re-prompts rather than silently keeping stale
 * consent.
 */
export const CONSENT_POLICY_VERSION = 1;

export interface ConsentChoice {
  readonly analytics: boolean;
  readonly advertising: boolean;
}

export interface StoredConsent extends ConsentChoice {
  readonly version: number;
  /** ISO 8601 — when this exact choice was recorded, for audit/debugging only, never a security control. */
  readonly grantedAt: string;
}

/** A stored record only counts if it was granted under the currently-active policy version. */
export function isConsentCurrent(stored: Pick<StoredConsent, 'version'> | undefined): boolean {
  return stored !== undefined && stored.version === CONSENT_POLICY_VERSION;
}
