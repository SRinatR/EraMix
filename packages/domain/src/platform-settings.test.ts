import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { validateEffectivePlatformSettings } from './platform-settings.js';
import type { PlatformSettings } from './entities.js';

function baseSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    version: 0,
    ...overrides,
  };
}

describe('validateEffectivePlatformSettings', () => {
  it('accepts a minimal valid settings state', () => {
    expect(() => validateEffectivePlatformSettings(baseSettings())).not.toThrow();
  });

  it.each([
    ['a bare word with no dot', 'localhost'],
    ['a scheme prefix', 'https://eramix.example'],
    ['a trailing path', 'eramix.example/foo'],
    ['a trailing dot', 'eramix.example.'],
    ['a leading hyphen label', '-eramix.example'],
    ['an empty string', ''],
  ])('rejects canonicalHost with %s', (_label, canonicalHost) => {
    expect(() => validateEffectivePlatformSettings(baseSettings({ canonicalHost }))).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects merchantCenterEnabled: true (no Offer model exists yet)', () => {
    expect(() =>
      validateEffectivePlatformSettings(baseSettings({ merchantCenterEnabled: true })),
    ).toThrow(ValidationFailedError);
  });

  it('rejects an invalid organizationEmail', () => {
    expect(() =>
      validateEffectivePlatformSettings(baseSettings({ organizationEmail: 'not-an-email' })),
    ).toThrow(ValidationFailedError);
  });

  it('accepts a valid organizationEmail', () => {
    expect(() =>
      validateEffectivePlatformSettings(baseSettings({ organizationEmail: 'info@eramix.example' })),
    ).not.toThrow();
  });

  it('rejects a non-https ogFallbackImageUrl', () => {
    expect(() =>
      validateEffectivePlatformSettings(
        baseSettings({ ogFallbackImageUrl: 'http://eramix.example/og.png' }),
      ),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a non-https organizationSameAs entry', () => {
    expect(() =>
      validateEffectivePlatformSettings(
        baseSettings({ organizationSameAs: ['https://ok.example', 'ftp://bad.example'] }),
      ),
    ).toThrow(ValidationFailedError);
  });

  it('rejects ga4Enabled without ga4MeasurementId', () => {
    expect(() => validateEffectivePlatformSettings(baseSettings({ ga4Enabled: true }))).toThrow(
      ValidationFailedError,
    );
  });

  it('accepts ga4Enabled with a measurement id', () => {
    expect(() =>
      validateEffectivePlatformSettings(
        baseSettings({ ga4Enabled: true, ga4MeasurementId: 'G-ABC123' }),
      ),
    ).not.toThrow();
  });

  it('rejects yandexMetricaEnabled without a counter id', () => {
    expect(() =>
      validateEffectivePlatformSettings(baseSettings({ yandexMetricaEnabled: true })),
    ).toThrow(ValidationFailedError);
  });
});
