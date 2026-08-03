import type {
  AnalyticsDispatchContext,
  AnalyticsDispatchResult,
  AnalyticsEventLike,
  AnalyticsEventSink,
} from '@eramix/application';

/**
 * Yandex Metrica's stable, publicly documented server-reportable hit
 * endpoint (`mc.yandex.ru/watch/{counterId}` — the same mechanism the
 * official JS tag and various server-side integrations use to report a
 * page hit without a browser). Unlike GA4's Measurement Protocol, Yandex
 * Metrica has no equally well-documented realtime custom-event/goal API
 * for this session to verify with confidence (goal-reaching is typically
 * either client-side `ym()` calls or a separate offline-conversion CSV
 * upload) — CLAUDE.md forbids inventing an endpoint/delivery behavior, so
 * this sink only ever reports `page_view` hits for real; every other event
 * name returns an explicit "not yet supported" result rather than a
 * fabricated request. Extending real-time goal parity is a documented
 * follow-up, not silently pretended here. `counterId` is read fresh from
 * `context.yandexMetricaCounterId` (PlatformSettings' existing non-secret
 * column) on every dispatch, never cached at construction.
 */
const ENDPOINT_BASE = 'https://mc.yandex.ru/watch';
const BASE_BACKOFF_MS = 500;

export interface YandexMetricaEventSinkOptions {
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly maxAttempts?: number;
}

export class YandexMetricaEventSink implements AnalyticsEventSink {
  readonly name = 'yandex_metrica';
  readonly requiredConsent = 'analytics' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(options: YandexMetricaEventSinkOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async dispatch(
    event: AnalyticsEventLike,
    context: AnalyticsDispatchContext,
  ): Promise<AnalyticsDispatchResult> {
    if (context.yandexMetricaCounterId === undefined) {
      return {
        sink: this.name,
        succeeded: false,
        error: 'PlatformSettings.yandexMetricaCounterId is not configured',
      };
    }
    if (event.eventName !== 'page_view') {
      return {
        sink: this.name,
        succeeded: false,
        error: `event "${event.eventName}" is not yet supported by the Yandex Metrica sink (page_view only — see this file's own doc comment)`,
      };
    }
    const pageUrl = `${context.canonicalOrigin}${event.canonicalPath}`;
    const url = `${ENDPOINT_BASE}/${encodeURIComponent(context.yandexMetricaCounterId)}?page-url=${encodeURIComponent(pageUrl)}&browser-info=en`;

    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, { method: 'GET' });
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
