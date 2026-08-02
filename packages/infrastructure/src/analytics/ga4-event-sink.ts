import type {
  AnalyticsDispatchContext,
  AnalyticsDispatchResult,
  AnalyticsEventLike,
  AnalyticsEventSink,
} from '@eramix/application';

/**
 * Google Analytics 4 Measurement Protocol (a stable, long-documented
 * server-to-server event API — https://developers.google.com/analytics/
 * devguides/collection/protocol/ga4). Bounded retry, never throws (same
 * "one destination's failure never blocks the caller" convention as
 * HttpIndexNowNotifier). `apiSecret` is a deployment secret (env
 * `GA4_API_SECRET`, never a PlatformSettings column — see
 * packages/infrastructure/src/env.ts); `measurementId` is read fresh from
 * `context.ga4MeasurementId` (PlatformSettings' existing non-secret column)
 * on every dispatch, never cached at construction — an admin changing it
 * takes effect on the next event, and a missing value declines rather than
 * dispatching with an empty ID.
 */
const ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const BASE_BACKOFF_MS = 500;

export interface Ga4EventSinkOptions {
  readonly apiSecret: string;
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly maxAttempts?: number;
}

export class Ga4EventSink implements AnalyticsEventSink {
  readonly name = 'ga4';
  readonly requiredConsent = 'analytics' as const;

  private readonly apiSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(options: Ga4EventSinkOptions) {
    this.apiSecret = options.apiSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async dispatch(
    event: AnalyticsEventLike,
    context: AnalyticsDispatchContext,
  ): Promise<AnalyticsDispatchResult> {
    if (context.ga4MeasurementId === undefined) {
      return {
        sink: this.name,
        succeeded: false,
        error: 'PlatformSettings.ga4MeasurementId is not configured',
      };
    }
    const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(context.ga4MeasurementId)}&api_secret=${encodeURIComponent(this.apiSecret)}`;
    const body = JSON.stringify({
      // A stable, non-PII per-session identifier — never a Google-linked or
      // cross-site identity (CLAUDE.md: "stable IDs and locale rather than
      // raw personal data").
      client_id: event.sessionId,
      events: [
        {
          name: event.eventName,
          params: eventParams(event, context),
        },
      ],
    });

    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        // Measurement Protocol returns 204 with no body on success; it does
        // not validate payload shape synchronously (the Debug endpoint does,
        // separately) — any 2xx is treated as accepted.
        if (response.ok) {
          return { sink: this.name, succeeded: true };
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < this.maxAttempts) {
        await this.sleepImpl(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
    return {
      sink: this.name,
      succeeded: false,
      ...(lastError !== undefined ? { error: lastError } : {}),
    };
  }
}

/** Only the already-validated, non-PII dimensions the domain event carries — never an extra field GA4 wasn't told about (CLAUDE.md: "external destinations may not receive extra fields"). */
function eventParams(
  event: AnalyticsEventLike,
  context: AnalyticsDispatchContext,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    event_id: event.eventId,
    locale: event.locale,
  };
  if ('canonicalPath' in event && typeof event['canonicalPath'] === 'string') {
    params['page_location'] = `${context.canonicalOrigin}${event['canonicalPath']}`;
  }
  for (const [key, value] of Object.entries(event)) {
    if (
      key === 'eventId' ||
      key === 'schemaVersion' ||
      key === 'eventName' ||
      key === 'occurredAt' ||
      key === 'sessionId' ||
      key === 'locale' ||
      key === 'consent'
    ) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = value;
    }
  }
  return params;
}
