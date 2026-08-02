import type {
  AnalyticsDispatchContext,
  AnalyticsDispatchResult,
  AnalyticsEventLike,
  AnalyticsEventSink,
} from '@eramix/application';

/**
 * CLAUDE.md/docs/runbooks/search-visibility.md: the Rust first-party
 * analytics service (Matomo-class) is a future integration, "currently not
 * expected to provide a stable contract before October 2026... disabled by
 * default... Prepare only its typed adapter boundary, schemas, fixtures,
 * feature flag, health/diagnostic contract... Do not invent an endpoint,
 * credentials, event delivery behavior or a replacement service."
 *
 * This class exists purely so `dispatchAnalyticsEvent`'s consent/enablement
 * gating (packages/application/src/analytics.ts) has a real port
 * implementation to register once PlatformSettings.rustAnalyticsEnabled is
 * ever flipped true — `dispatch` never performs a network call under any
 * configuration; there is no known real endpoint to call.
 */
export class RustAnalyticsEventSink implements AnalyticsEventSink {
  readonly name = 'rust_analytics';
  readonly requiredConsent = 'analytics' as const;

  dispatch(
    _event: AnalyticsEventLike,
    _context: AnalyticsDispatchContext,
  ): Promise<AnalyticsDispatchResult> {
    return Promise.resolve({
      sink: this.name,
      succeeded: false,
      error:
        'Rust analytics service contract is not yet available (expected no earlier than October 2026) — this is a prepared, inert typed adapter boundary only.',
    });
  }
}
