import { validateAnalyticsEvent, type AnalyticsEvent } from '@eramix/domain';
import type { AnalyticsDispatchResult, AnalyticsEventSink, Clock } from './ports.js';
import type { OutboxMessageRepository, PlatformSettingsRepository } from './repositories.js';
import { buildCanonicalOrigin } from './settings.js';

/**
 * Ingestion-side use case (docs/runbooks/search-visibility.md: "consent
 * state, anonymous/consented session identity, event ID/idempotency,
 * schema version, timestamp, locale/entity dimensions... batching/retry").
 * All-or-nothing: the first invalid event in a batch rejects the whole
 * request (422) rather than silently dropping just the bad one — the
 * caller is always EraMix's own first-party site JS, so a malformed event
 * is a client bug to surface immediately, not data to quietly lose.
 * EraMix does not persist events itself (docs/runbooks/search-visibility.md:
 * the Rust service "owns collection/storage"); each valid event becomes one
 * transactional outbox message, dispatched best-effort by apps/worker.
 */
export interface RecordAnalyticsEventsDeps {
  readonly outboxRepo: OutboxMessageRepository;
  readonly clock: Clock;
}

export async function recordAnalyticsEvents(
  deps: RecordAnalyticsEventsDeps,
  events: readonly AnalyticsEvent[],
): Promise<void> {
  const now = deps.clock.now();
  for (const event of events) {
    validateAnalyticsEvent(event, now);
  }
  for (const event of events) {
    await deps.outboxRepo.enqueue({
      aggregateType: 'AnalyticsEvent',
      aggregateId: event.eventId,
      eventType: 'analytics.event_captured',
      payload: event as unknown as Record<string, unknown>,
    });
  }
}

/**
 * Consent- and enablement-gated fan-out to every registered sink
 * (apps/worker's outbox dispatch loop is the only caller). A sink is
 * skipped — never called — unless the event's own self-reported consent
 * state grants that sink's required consent category *and* the live
 * PlatformSettings enablement flag for that sink is on; both are checked
 * fresh per dispatch, never cached, so disabling GA4/Yandex Metrica in
 * admin takes effect on the very next event.
 */
export interface DispatchAnalyticsEventDeps {
  readonly sinks: readonly AnalyticsEventSink[];
  readonly settingsRepo: PlatformSettingsRepository;
}

const SINK_ENABLEMENT_FIELD: Record<
  string,
  'ga4Enabled' | 'yandexMetricaEnabled' | 'rustAnalyticsEnabled'
> = {
  ga4: 'ga4Enabled',
  yandex_metrica: 'yandexMetricaEnabled',
  rust_analytics: 'rustAnalyticsEnabled',
};

export async function dispatchAnalyticsEvent(
  deps: DispatchAnalyticsEventDeps,
  event: AnalyticsEvent,
): Promise<readonly AnalyticsDispatchResult[]> {
  if (deps.sinks.length === 0) {
    return [];
  }
  const settings = await deps.settingsRepo.get();
  const context = {
    canonicalOrigin: buildCanonicalOrigin(settings),
    ...(settings.ga4MeasurementId !== undefined
      ? { ga4MeasurementId: settings.ga4MeasurementId }
      : {}),
    ...(settings.yandexMetricaCounterId !== undefined
      ? { yandexMetricaCounterId: settings.yandexMetricaCounterId }
      : {}),
  };
  const results: AnalyticsDispatchResult[] = [];
  for (const sink of deps.sinks) {
    const consentGranted = event.consent[sink.requiredConsent];
    const enablementField = SINK_ENABLEMENT_FIELD[sink.name];
    const enabled = enablementField !== undefined && settings[enablementField];
    if (!consentGranted || !enabled) {
      results.push({ sink: sink.name, succeeded: false, skipped: true });
      continue;
    }
    results.push(await sink.dispatch(event, context));
  }
  return results;
}
