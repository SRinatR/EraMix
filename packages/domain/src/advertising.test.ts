import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { validateEffectiveAdvertisingProviderConfig } from './advertising.js';
import type { AdvertisingProviderConfig } from './entities.js';

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
