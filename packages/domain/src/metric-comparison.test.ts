import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import {
  METRIC_DICTIONARY,
  METRIC_DICTIONARY_VERSION,
  compareSourceMeasurements,
  getMetricDefinition,
  type SourceMeasurement,
} from './metric-comparison.js';

describe('METRIC_DICTIONARY', () => {
  it('defines every metric with a positive freshness SLA and a non-empty reconciliation note', () => {
    for (const definition of METRIC_DICTIONARY) {
      expect(definition.freshnessSlaHours).toBeGreaterThan(0);
      expect(definition.reconciliationNote.length).toBeGreaterThan(0);
      expect(definition.applicableSources.length).toBeGreaterThan(0);
    }
  });

  it('only declares a currency for currency-unit metrics', () => {
    for (const definition of METRIC_DICTIONARY) {
      if (definition.unit !== 'currency') {
        expect(definition.currency).toBeUndefined();
      }
    }
  });
});

describe('getMetricDefinition', () => {
  it('throws ValidationFailedError for an unknown metricId', () => {
    // @ts-expect-error deliberately invalid at the type level to exercise the runtime guard
    expect(() => getMetricDefinition('not_a_real_metric')).toThrow(ValidationFailedError);
  });
});

function measurement(
  overrides: Partial<SourceMeasurement> & Pick<SourceMeasurement, 'source' | 'value'>,
) {
  return {
    metricId: 'sessions',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-01',
    ...overrides,
  } as SourceMeasurement;
}

describe('compareSourceMeasurements', () => {
  it('rejects an empty measurement list', () => {
    expect(() => compareSourceMeasurements('sessions', [])).toThrow(ValidationFailedError);
  });

  it('rejects a measurement whose own metricId does not match the requested metric', () => {
    expect(() =>
      compareSourceMeasurements('sessions', [
        measurement({ source: 'ga4', value: 100, metricId: 'page_views' }),
      ]),
    ).toThrow(ValidationFailedError);
  });

  it('marks two same-period, same-source-allowlist measurements comparable and computes their discrepancy without merging them', () => {
    const result = compareSourceMeasurements('sessions', [
      measurement({ source: 'ga4', value: 1000 }),
      measurement({ source: 'yandex_metrica', value: 900 }),
    ]);

    expect(result.dictionaryVersion).toBe(METRIC_DICTIONARY_VERSION);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.comparable)).toBe(true);
    // Every source's own value survives untouched — no merged/blended field exists anywhere on the result.
    expect(result.entries.map((e) => e.value)).toEqual([1000, 900]);
    expect(result).not.toHaveProperty('mergedValue');
    expect(result).not.toHaveProperty('truthValue');

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toMatchObject({
      sourceA: 'ga4',
      sourceB: 'yandex_metrica',
      absoluteDifference: 100,
    });
    expect(result.discrepancies[0]?.percentDifference).toBeCloseTo(10, 5);
  });

  it("marks a source not on the metric's applicableSources allowlist as incomparable, but still reports its native value", () => {
    const result = compareSourceMeasurements('sessions', [
      measurement({ source: 'ga4', value: 1000 }),
      measurement({ source: 'google_ads', value: 50 }),
    ]);

    const gaEntry = result.entries.find((e) => e.source === 'google_ads');
    expect(gaEntry?.comparable).toBe(false);
    expect(gaEntry?.incomparableReason).toContain('not an applicable source');
    expect(gaEntry?.value).toBe(50);
    // The incomparable source is excluded from discrepancy computation entirely.
    expect(result.discrepancies).toHaveLength(0);
  });

  it('marks measurements with mismatched reporting periods as incomparable rather than silently comparing across periods', () => {
    const result = compareSourceMeasurements('sessions', [
      measurement({
        source: 'ga4',
        value: 1000,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-01',
      }),
      measurement({
        source: 'yandex_metrica',
        value: 900,
        periodStart: '2026-08-02',
        periodEnd: '2026-08-02',
      }),
    ]);

    const yandexEntry = result.entries.find((e) => e.source === 'yandex_metrica');
    expect(yandexEntry?.comparable).toBe(false);
    expect(yandexEntry?.incomparableReason).toContain('Reporting period');
  });

  it('marks a conversions measurement with a mismatched attribution window as incomparable', () => {
    const result = compareSourceMeasurements('conversions', [
      measurement({
        source: 'ga4',
        value: 20,
        metricId: 'conversions',
        attributionWindowDaysUsed: 30,
      }),
      measurement({
        source: 'google_ads',
        value: 25,
        metricId: 'conversions',
        attributionWindowDaysUsed: 7,
      }),
    ]);

    const adsEntry = result.entries.find((e) => e.source === 'google_ads');
    expect(adsEntry?.comparable).toBe(false);
    expect(adsEntry?.incomparableReason).toContain('Attribution window');
  });

  it('marks a mismatched-currency cost measurement incomparable rather than silently converting it', () => {
    const result = compareSourceMeasurements('cost', [
      measurement({ source: 'google_ads', value: 500, metricId: 'cost', currency: 'USD' }),
      measurement({ source: 'yandex_direct', value: 40000, metricId: 'cost', currency: 'RUB' }),
    ]);

    const yandexEntry = result.entries.find((e) => e.source === 'yandex_direct');
    expect(yandexEntry?.comparable).toBe(false);
    expect(yandexEntry?.incomparableReason).toContain('Currency');
    expect(result.discrepancies).toHaveLength(0);
  });

  it('compares two same-currency cost measurements normally', () => {
    const result = compareSourceMeasurements('cost', [
      measurement({ source: 'google_ads', value: 500, metricId: 'cost', currency: 'USD' }),
      measurement({ source: 'meta', value: 480, metricId: 'cost', currency: 'USD' }),
    ]);

    expect(result.entries.every((e) => e.comparable)).toBe(true);
    expect(result.discrepancies).toHaveLength(1);
  });
});
