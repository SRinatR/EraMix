import { ValidationFailedError } from './errors.js';
import type { ConsentCategory } from './entities.js';

/**
 * The governed cross-platform metric comparison layer (CLAUDE.md: "Build a
 * governed comparison layer for Rust analytics, GA4, Yandex Metrica,
 * advertising platforms, Search Console and Yandex Webmaster. It defines
 * metric meaning, attribution window, timezone, currency, consent/sampling
 * coverage, freshness and reconciliation rules... never silently merge
 * incompatible counts into one 'truth' number."
 *
 * There is no live cross-source data ingestion in this codebase yet — no
 * GA4 Reporting API, Search Console API, Yandex Webmaster API, Rust
 * analytics, or ad-platform reporting credential exists or is invented here.
 * This module is the governance contract those future integrations must
 * call through: a versioned metric dictionary (meaning/units/attribution/
 * timezone/currency/consent/sampling/freshness/reconciliation per metric),
 * and a pure comparison function that keeps every source's own number
 * intact — there is structurally no field anywhere in this module capable
 * of holding a single merged "truth" value across sources.
 */

/** Bump only when a metric's definition materially changes (unit, attribution window, applicable sources) — never for a routine wording fix. A stale dictionaryVersion on a stored comparison flags it for re-evaluation rather than being silently trusted. */
export const METRIC_DICTIONARY_VERSION = 1;

/** The closed source allowlist — also the single runtime source of truth zod schemas at the delivery boundary validate against, never a duplicated literal list. */
export const METRIC_SOURCES = [
  'rust_analytics',
  'ga4',
  'yandex_metrica',
  'google_search_console',
  'yandex_webmaster',
  'google_ads',
  'yandex_direct',
  'microsoft_ads',
  'meta',
  'linkedin',
  'tiktok',
] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

/** The closed metric-id allowlist — same "single runtime source of truth" convention as METRIC_SOURCES. */
export const METRIC_IDS = [
  'sessions',
  'page_views',
  'conversions',
  'clicks',
  'impressions',
  'search_queries',
  'cost',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

export interface MetricDefinition {
  readonly metricId: MetricId;
  readonly displayName: string;
  readonly meaning: string;
  readonly unit: 'count' | 'currency';
  readonly applicableSources: readonly MetricSource[];
  /** undefined for metrics with no attribution window (e.g. raw impressions/search queries). */
  readonly attributionWindowDays?: number | undefined;
  readonly timezone: string;
  /** ISO 4217, only present for `unit: 'currency'` metrics. */
  readonly currency?: string | undefined;
  /** undefined means this metric carries no personal/session-identifying data and is never consent-gated (e.g. Search Console query volume). */
  readonly consentCategoryRequired?: ConsentCategory | undefined;
  readonly samplingNote: string;
  readonly freshnessSlaHours: number;
  readonly reconciliationNote: string;
}

export const METRIC_DICTIONARY: readonly MetricDefinition[] = [
  {
    metricId: 'sessions',
    displayName: 'Sessions',
    meaning: 'A bounded visit by one visitor, per the source’s own session-timeout rule.',
    unit: 'count',
    applicableSources: ['rust_analytics', 'ga4', 'yandex_metrica'],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    consentCategoryRequired: 'ANALYTICS',
    samplingNote:
      'GA4 applies statistical sampling above its own account-tier thresholds; Yandex Metrica and the first-party Rust service are census (unsampled) for this MVP’s traffic volume.',
    freshnessSlaHours: 24,
    reconciliationNote:
      'Session-timeout windows differ by source (GA4 30 min default, Yandex Metrica 30 min default, Rust service definition is deployment-configured) — counts are expected to diverge and are never merged into one figure.',
  },
  {
    metricId: 'page_views',
    displayName: 'Page views',
    meaning: 'A single canonical-URL render event recorded by the source.',
    unit: 'count',
    applicableSources: ['rust_analytics', 'ga4', 'yandex_metrica'],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    consentCategoryRequired: 'ANALYTICS',
    samplingNote: 'Same per-source sampling behaviour as `sessions`.',
    freshnessSlaHours: 24,
    reconciliationNote:
      'Bot/crawler filtering rules differ per source; a page view is never counted as identical across sources without matching source-native filtering settings.',
  },
  {
    metricId: 'conversions',
    displayName: 'Conversions (leads)',
    meaning:
      'A `generate_lead`/`lead_submitted` analytics event (packages/domain/src/analytics.ts) or a provider’s own native conversion action, whichever the source natively tracks.',
    unit: 'count',
    applicableSources: [
      'rust_analytics',
      'ga4',
      'yandex_metrica',
      'google_ads',
      'yandex_direct',
      'microsoft_ads',
      'meta',
      'linkedin',
      'tiktok',
    ],
    attributionWindowDays: 30,
    timezone: 'UTC',
    consentCategoryRequired: 'ADVERTISING',
    samplingNote:
      'Not sampled — conversions are a low-volume, high-value event class in every source.',
    freshnessSlaHours: 24,
    reconciliationNote:
      'Each ad platform applies its own attribution model (last-click, data-driven, etc.) on top of its own attribution window — a conversion count from one provider is never assumed equivalent to another’s or to GA4/Yandex Metrica’s without the same window and model.',
  },
  {
    metricId: 'clicks',
    displayName: 'Ad clicks',
    meaning: 'A provider-recorded click on a paid placement.',
    unit: 'count',
    applicableSources: [
      'google_ads',
      'yandex_direct',
      'microsoft_ads',
      'meta',
      'linkedin',
      'tiktok',
    ],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    consentCategoryRequired: 'ADVERTISING',
    samplingNote: 'Not sampled — every provider reports full click counts natively.',
    freshnessSlaHours: 48,
    reconciliationNote:
      'Click fraud/invalid-click filtering differs per provider; a click count is never reconciled against session counts from GA4/Yandex Metrica as if they measured the same event.',
  },
  {
    metricId: 'impressions',
    displayName: 'Impressions',
    meaning: 'A provider-recorded render of a paid placement or an organic search result.',
    unit: 'count',
    applicableSources: [
      'google_ads',
      'yandex_direct',
      'microsoft_ads',
      'meta',
      'linkedin',
      'tiktok',
      'google_search_console',
      'yandex_webmaster',
    ],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    consentCategoryRequired: undefined,
    samplingNote:
      'Search Console applies its own aggregation/anonymization thresholds for low-volume queries; ad-platform impressions are census.',
    freshnessSlaHours: 72,
    reconciliationNote:
      'Search-engine impression definitions (Search Console vs Yandex Webmaster) are not identical — never combined into a single "total impressions" figure across engines.',
  },
  {
    metricId: 'cost',
    displayName: 'Ad spend',
    meaning:
      'A provider’s own reported spend for a reporting period, in the provider’s billing currency.',
    unit: 'currency',
    applicableSources: [
      'google_ads',
      'yandex_direct',
      'microsoft_ads',
      'meta',
      'linkedin',
      'tiktok',
    ],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    currency: 'USD',
    consentCategoryRequired: undefined,
    samplingNote: 'Not sampled — every provider reports exact billed spend.',
    freshnessSlaHours: 48,
    reconciliationNote:
      'Providers billing in a different currency (e.g. Yandex Direct in RUB) are never auto-converted here — a mismatched currency is reported as incomparable rather than silently converted at an assumed exchange rate.',
  },
  {
    metricId: 'search_queries',
    displayName: 'Search queries (organic)',
    meaning:
      'A distinct organic search query string a source recorded as leading to an impression or click.',
    unit: 'count',
    applicableSources: ['google_search_console', 'yandex_webmaster'],
    attributionWindowDays: undefined,
    timezone: 'UTC',
    consentCategoryRequired: undefined,
    samplingNote:
      'Both engines suppress low-volume/anonymizable queries by their own undisclosed thresholds — the reported query list is never a complete census.',
    freshnessSlaHours: 72,
    reconciliationNote:
      'Google and Yandex index and rank independently; query-level figures from the two engines are shown side by side and never summed.',
  },
];

export function getMetricDefinition(metricId: MetricId): MetricDefinition {
  const definition = METRIC_DICTIONARY.find((entry) => entry.metricId === metricId);
  if (!definition) {
    throw new ValidationFailedError(`Unknown metricId: ${metricId}`, { metricId });
  }
  return definition;
}

/** A single source's own reported number for one metric over one reporting period — never adjusted, scaled, or merged before being recorded here. */
export interface SourceMeasurement {
  readonly source: MetricSource;
  readonly metricId: MetricId;
  readonly value: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** Only meaningful when the metric has an attributionWindowDays; omit for metrics with none. */
  readonly attributionWindowDaysUsed?: number | undefined;
  /** Only meaningful for `unit: 'currency'` metrics. */
  readonly currency?: string | undefined;
}

export interface MetricComparisonEntry {
  readonly source: MetricSource;
  readonly value: number;
  /** False when this source is structurally not comparable to the others in this call — the value is still reported (source-native), just never merged or diffed against a mismatched source. */
  readonly comparable: boolean;
  readonly incomparableReason?: string | undefined;
}

export interface MetricDiscrepancy {
  readonly sourceA: MetricSource;
  readonly sourceB: MetricSource;
  readonly absoluteDifference: number;
  readonly percentDifference: number;
}

export interface MetricComparisonResult {
  readonly metricId: MetricId;
  readonly dictionaryVersion: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly entries: readonly MetricComparisonEntry[];
  /** Only ever computed between pairs both marked `comparable: true` — the discrepancy is a diagnostic signal, never a merge. */
  readonly discrepancies: readonly MetricDiscrepancy[];
}

/**
 * Normalizes source-native measurements for display side by side — it
 * never produces a single blended number. A measurement is only marked
 * `comparable: true` when its source is on the metric's own
 * `applicableSources` allowlist, its reporting period exactly matches the
 * other measurements, and (when the metric defines them) its attribution
 * window and currency match the dictionary definition — any mismatch is
 * reported as a visible reason, not silently dropped or averaged away.
 */
export function compareSourceMeasurements(
  metricId: MetricId,
  measurements: readonly SourceMeasurement[],
): MetricComparisonResult {
  const definition = getMetricDefinition(metricId);
  if (measurements.length === 0) {
    throw new ValidationFailedError('At least one measurement is required to build a comparison.', {
      metricId,
    });
  }
  for (const measurement of measurements) {
    if (measurement.metricId !== metricId) {
      throw new ValidationFailedError(
        `Measurement for source ${measurement.source} declares metricId ${measurement.metricId}, expected ${metricId}.`,
        { metricId, source: measurement.source },
      );
    }
  }

  const { periodStart, periodEnd } = measurements[0]!;

  const entries: MetricComparisonEntry[] = measurements.map((measurement) => {
    if (!definition.applicableSources.includes(measurement.source)) {
      return {
        source: measurement.source,
        value: measurement.value,
        comparable: false,
        incomparableReason: `${measurement.source} is not an applicable source for metric ${metricId}.`,
      };
    }
    if (measurement.periodStart !== periodStart || measurement.periodEnd !== periodEnd) {
      return {
        source: measurement.source,
        value: measurement.value,
        comparable: false,
        incomparableReason:
          'Reporting period does not match the other measurements in this comparison.',
      };
    }
    if (
      definition.attributionWindowDays !== undefined &&
      measurement.attributionWindowDaysUsed !== undefined &&
      measurement.attributionWindowDaysUsed !== definition.attributionWindowDays
    ) {
      return {
        source: measurement.source,
        value: measurement.value,
        comparable: false,
        incomparableReason: `Attribution window (${measurement.attributionWindowDaysUsed}d) does not match the dictionary's ${definition.attributionWindowDays}d for ${metricId}.`,
      };
    }
    if (
      definition.currency !== undefined &&
      measurement.currency !== undefined &&
      measurement.currency !== definition.currency
    ) {
      return {
        source: measurement.source,
        value: measurement.value,
        comparable: false,
        incomparableReason: `Currency (${measurement.currency}) does not match the dictionary's ${definition.currency} for ${metricId} — no conversion is ever applied here.`,
      };
    }
    return { source: measurement.source, value: measurement.value, comparable: true };
  });

  const comparableEntries = entries.filter((entry) => entry.comparable);
  const discrepancies: MetricDiscrepancy[] = [];
  for (let i = 0; i < comparableEntries.length; i += 1) {
    for (let j = i + 1; j < comparableEntries.length; j += 1) {
      const a = comparableEntries[i]!;
      const b = comparableEntries[j]!;
      const absoluteDifference = Math.abs(a.value - b.value);
      const largerBase = Math.max(Math.abs(a.value), Math.abs(b.value));
      const percentDifference = largerBase === 0 ? 0 : (absoluteDifference / largerBase) * 100;
      discrepancies.push({
        sourceA: a.source,
        sourceB: b.source,
        absoluteDifference,
        percentDifference,
      });
    }
  }

  return {
    metricId,
    dictionaryVersion: METRIC_DICTIONARY_VERSION,
    periodStart,
    periodEnd,
    entries,
    discrepancies,
  };
}
