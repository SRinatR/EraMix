import { AccessDeniedError, ValidationFailedError } from '@eramix/domain';
import type { SourceMeasurement } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { compareMetricSources, getMetricDictionary } from './metric-comparison.js';

describe('getMetricDictionary', () => {
  it('denies an actor without settings.manage', () => {
    expect(() => getMetricDictionary('CONTENT_EDITOR')).toThrow(AccessDeniedError);
  });

  it('returns the full dictionary to an ADMIN', () => {
    const dictionary = getMetricDictionary('ADMIN');
    expect(dictionary.length).toBeGreaterThan(0);
    expect(dictionary.map((d) => d.metricId)).toContain('sessions');
  });
});

describe('compareMetricSources', () => {
  const measurements: readonly SourceMeasurement[] = [
    {
      source: 'ga4',
      metricId: 'sessions',
      value: 1000,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-01',
    },
    {
      source: 'yandex_metrica',
      metricId: 'sessions',
      value: 900,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-01',
    },
  ];

  it('denies an actor without settings.manage', () => {
    expect(() => compareMetricSources('CONTENT_EDITOR', 'sessions', measurements)).toThrow(
      AccessDeniedError,
    );
  });

  it('delegates to the pure domain comparison for an ADMIN actor', () => {
    const result = compareMetricSources('ADMIN', 'sessions', measurements);
    expect(result.entries).toHaveLength(2);
    expect(result.discrepancies).toHaveLength(1);
  });

  it("surfaces the domain layer's validation error for an empty measurement list", () => {
    expect(() => compareMetricSources('ADMIN', 'sessions', [])).toThrow(ValidationFailedError);
  });
});
