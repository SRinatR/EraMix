import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import {
  isAdvertisingProviderDispatchAllowed,
  validateEffectiveAdvertisingProviderConfig,
} from './advertising.js';
import type { AdvertisingProviderConfig } from './entities.js';
import type { ConsentChoice } from './consent.js';

function makeConfig(overrides: Partial<AdvertisingProviderConfig> = {}): AdvertisingProviderConfig {
  return {
    id: 'config-1',
    provider: 'GOOGLE_ADS',
    enabled: false,
    consentCategory: 'ADVERTISING',
    testMode: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

describe('validateEffectiveAdvertisingProviderConfig', () => {
  it('allows a disabled provider with no identifiers at all', () => {
    expect(() => validateEffectiveAdvertisingProviderConfig(makeConfig())).not.toThrow();
  });

  it('rejects enabling a provider with no identifier configured', () => {
    expect(() => validateEffectiveAdvertisingProviderConfig(makeConfig({ enabled: true }))).toThrow(
      ValidationFailedError,
    );
  });

  it('allows enabling a provider with only an accountId', () => {
    expect(() =>
      validateEffectiveAdvertisingProviderConfig(
        makeConfig({ enabled: true, accountId: '123-456-7890' }),
      ),
    ).not.toThrow();
  });

  it('allows enabling a provider with only a containerId', () => {
    expect(() =>
      validateEffectiveAdvertisingProviderConfig(
        makeConfig({ enabled: true, containerId: 'GTM-ABCDEF' }),
      ),
    ).not.toThrow();
  });

  it('allows enabling a provider with only a pixelId', () => {
    expect(() =>
      validateEffectiveAdvertisingProviderConfig(
        makeConfig({ enabled: true, pixelId: '999888777' }),
      ),
    ).not.toThrow();
  });

  it('rejects enabling a provider whose only identifier is whitespace', () => {
    expect(() =>
      validateEffectiveAdvertisingProviderConfig(makeConfig({ enabled: true, accountId: '   ' })),
    ).toThrow(ValidationFailedError);
  });
});

describe('isAdvertisingProviderDispatchAllowed', () => {
  const grantedBoth: ConsentChoice = { analytics: true, advertising: true };
  const grantedNeither: ConsentChoice = { analytics: false, advertising: false };

  it('never allows dispatch for a disabled provider, even with full consent granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: false, consentCategory: 'ADVERTISING' },
        grantedBoth,
      ),
    ).toBe(false);
  });

  it('allows dispatch for an enabled ADVERTISING-category provider once advertising consent is granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ADVERTISING' },
        grantedBoth,
      ),
    ).toBe(true);
  });

  it('blocks an enabled ADVERTISING-category provider when only analytics consent is granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ADVERTISING' },
        { analytics: true, advertising: false },
      ),
    ).toBe(false);
  });

  it('allows dispatch for an enabled ANALYTICS-category provider once analytics consent is granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ANALYTICS' },
        { analytics: true, advertising: false },
      ),
    ).toBe(true);
  });

  it('blocks an enabled ANALYTICS-category provider when only advertising consent is granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ANALYTICS' },
        { analytics: false, advertising: true },
      ),
    ).toBe(false);
  });

  it('blocks any enabled provider when no consent at all has been granted', () => {
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ADVERTISING' },
        grantedNeither,
      ),
    ).toBe(false);
    expect(
      isAdvertisingProviderDispatchAllowed(
        { enabled: true, consentCategory: 'ANALYTICS' },
        grantedNeither,
      ),
    ).toBe(false);
  });
});
