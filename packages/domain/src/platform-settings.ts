import { ValidationFailedError } from './errors.js';
import type { PlatformSettings } from './entities.js';

// Deny-by-default hostname allowlist: lowercase ASCII letters/digits,
// single-dot-separated labels, optional single hyphens within a label. No
// scheme, no path, no port, no trailing dot — this is a host, not a URL
// (CLAUDE.md's "canonical public host" setting, distinct from PUBLIC_ORIGIN's
// full origin).
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

// packages/domain stays framework/platform-free (no DOM/Node lib, so no
// global `URL`) — a regex is sufficient for "must be an absolute https URL"
// and matches this package's existing convention (see slug.ts's
// deny-by-default pattern) rather than pulling in an ambient `URL` declaration
// the way pagination.ts does for a genuinely unavoidable case.
const HTTPS_URL_PATTERN = /^https:\/\/[^\s]+$/;

function assertHttpsUrl(value: string, field: string): void {
  if (!HTTPS_URL_PATTERN.test(value)) {
    throw new ValidationFailedError(`${field} must be an absolute https URL.`, { field, value });
  }
}

/**
 * Pure, framework-free validation for the *effective* PlatformSettings state
 * a write would produce (i.e. current settings merged with the caller's
 * patch — cross-field checks like "GA4 enabled requires a measurement ID"
 * must see the value whether it came from this write or an earlier one).
 * Enforces the invariants CLAUDE.md/search-visibility.md name as
 * non-negotiable at the data layer; RBAC, optimistic concurrency, and
 * audit/history are the application layer's concern, not this function's.
 */
export function validateEffectivePlatformSettings(effective: PlatformSettings): void {
  if (!HOSTNAME_PATTERN.test(effective.canonicalHost)) {
    throw new ValidationFailedError(
      'canonicalHost must be a bare hostname (no scheme, path, port, or trailing dot).',
      { canonicalHost: effective.canonicalHost },
    );
  }
  if (effective.merchantCenterEnabled) {
    throw new ValidationFailedError(
      "merchantCenterEnabled cannot be enabled: no versioned sellable-offer (Merchant) model exists yet. This flag is prepared scaffolding only — see docs/runbooks/search-visibility.md's direct-sale launch sequence.",
      { merchantCenterEnabled: true },
    );
  }
  if (
    effective.organizationEmail !== undefined &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effective.organizationEmail)
  ) {
    throw new ValidationFailedError('organizationEmail is not a valid email address.', {
      organizationEmail: effective.organizationEmail,
    });
  }
  if (effective.ogFallbackImageUrl !== undefined) {
    assertHttpsUrl(effective.ogFallbackImageUrl, 'ogFallbackImageUrl');
  }
  if (effective.organizationSameAs !== undefined) {
    for (const url of effective.organizationSameAs) {
      assertHttpsUrl(url, 'organizationSameAs');
    }
  }
  if (effective.ga4Enabled && (effective.ga4MeasurementId ?? '').trim().length === 0) {
    throw new ValidationFailedError('ga4MeasurementId is required when ga4Enabled is true.', {
      ga4Enabled: true,
    });
  }
  if (
    effective.yandexMetricaEnabled &&
    (effective.yandexMetricaCounterId ?? '').trim().length === 0
  ) {
    throw new ValidationFailedError(
      'yandexMetricaCounterId is required when yandexMetricaEnabled is true.',
      { yandexMetricaEnabled: true },
    );
  }
}
