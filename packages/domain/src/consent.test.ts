import { describe, expect, it } from 'vitest';
import { CONSENT_POLICY_VERSION, isConsentCurrent } from './consent.js';

describe('isConsentCurrent', () => {
  it('returns false when no consent has ever been stored', () => {
    expect(isConsentCurrent(undefined)).toBe(false);
  });

  it('returns true for a record matching the current policy version', () => {
    expect(isConsentCurrent({ version: CONSENT_POLICY_VERSION })).toBe(true);
  });

  it('returns false for a record from a prior policy version (forces re-prompt, never silently reuses stale consent)', () => {
    expect(isConsentCurrent({ version: CONSENT_POLICY_VERSION - 1 })).toBe(false);
  });

  it('returns false for a record from a future/unknown policy version', () => {
    expect(isConsentCurrent({ version: CONSENT_POLICY_VERSION + 1 })).toBe(false);
  });
});
