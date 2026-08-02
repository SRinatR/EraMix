import { ValidationFailedError } from './errors.js';
import type { AdvertisingProviderConfig } from './entities.js';

/**
 * Pure, framework-free validation for the *effective* AdvertisingProviderConfig
 * state a write would produce (current config merged with the caller's
 * patch — same "see the merged value, not just the raw patch" convention as
 * validateEffectivePlatformSettings). CLAUDE.md: the advertising control
 * plane may "never inject arbitrary vendor JavaScript, expose access
 * tokens... without the required consent" — this enforces the two
 * data-layer invariants that make that possible: an enabled provider must
 * carry at least one real, non-secret identifier (never activated with
 * nothing to integrate), and enabling it never happens without an explicit
 * consent category already being on the type (never optional at the
 * TypeScript level, but re-asserted here since a raw DB row could
 * theoretically be malformed).
 */
export function validateEffectiveAdvertisingProviderConfig(
  effective: AdvertisingProviderConfig,
): void {
  if (!effective.enabled) {
    return;
  }
  if (effective.consentCategory !== 'ANALYTICS' && effective.consentCategory !== 'ADVERTISING') {
    throw new ValidationFailedError(
      `Provider ${effective.provider} cannot be enabled without a valid consentCategory.`,
      { provider: effective.provider },
    );
  }
  const hasIdentifier =
    (effective.accountId ?? '').trim().length > 0 ||
    (effective.containerId ?? '').trim().length > 0 ||
    (effective.pixelId ?? '').trim().length > 0;
  if (!hasIdentifier) {
    throw new ValidationFailedError(
      `Provider ${effective.provider} cannot be enabled without at least one of accountId/containerId/pixelId.`,
      { provider: effective.provider },
    );
  }
}
