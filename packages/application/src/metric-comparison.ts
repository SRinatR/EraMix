import {
  compareSourceMeasurements as compareSourceMeasurementsPure,
  METRIC_DICTIONARY,
  type MetricComparisonResult,
  type MetricDefinition,
  type MetricId,
  type PlatformRole,
  type SourceMeasurement,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';

/**
 * Admin-facing entry points for the governed cross-platform metric
 * comparison layer (CLAUDE.md: "Build a governed comparison layer... never
 * silently merge incompatible counts into one 'truth' number"). Stateless —
 * there is no persistence here and no live source integration invoked; a
 * caller supplies the source-native measurements it already holds (once a
 * real GA4 Reporting/Search Console/Yandex Webmaster/Rust-analytics/ad-
 * platform integration exists) and this only normalizes them for governed
 * side-by-side comparison per packages/domain/src/metric-comparison.ts.
 */

export function getMetricDictionary(actorRole: PlatformRole): readonly MetricDefinition[] {
  requirePermission(actorRole, 'settings.manage');
  return METRIC_DICTIONARY;
}

export function compareMetricSources(
  actorRole: PlatformRole,
  metricId: MetricId,
  measurements: readonly SourceMeasurement[],
): MetricComparisonResult {
  requirePermission(actorRole, 'settings.manage');
  return compareSourceMeasurementsPure(metricId, measurements);
}
