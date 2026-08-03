import type {
  AnalyticsEventSink,
  AnalyticsSinkStatusRepository,
  Clock,
  EmailSender,
  IndexNowNotifier,
  OutboxMessageRepository,
  PlatformSettingsRepository,
} from '@eramix/application';
import { buildCanonicalOrigin, dispatchAnalyticsEvent } from '@eramix/application';
import { validateAnalyticsEvent, type AnalyticsEvent, type OutboxMessage } from '@eramix/domain';
import type { Logger } from '@eramix/infrastructure';

export interface OutboxWorkerDeps {
  readonly outbox: OutboxMessageRepository;
  readonly email: EmailSender;
  readonly logger: Logger;
  readonly clock: Clock;
  /**
   * IndexNow (CLAUDE.md: P1, Bing/Yandex-only). All three optional and only
   * used together — submission only happens when the deployment secret
   * (indexNowKey), a live PlatformSettings row, and its admin-controlled
   * indexNowEnabled kill switch all agree. Live settings are re-fetched
   * every batch (not cached at worker startup) so disabling the switch in
   * admin takes effect on the next poll cycle without a worker restart.
   */
  readonly indexNow?: IndexNowNotifier;
  readonly settingsRepo?: PlatformSettingsRepository;
  readonly indexNowKey?: string;
  /** GA4/Yandex Metrica/Rust sinks (packages/application/src/analytics.ts's dispatchAnalyticsEvent does the consent/enablement gating per sink). Empty/omitted means analytics.event_captured messages are simply marked SENT with nothing dispatched. */
  readonly analyticsSinks?: readonly AnalyticsEventSink[];
  /** Records the per-sink diagnostic snapshot admin sees (CLAUDE.md: "last safe delivery result"). Optional and best-effort — a write failure here must never affect the outbox message's own SENT/FAILED/DEAD_LETTER outcome. */
  readonly analyticsSinkStatusRepo?: AnalyticsSinkStatusRepository;
}

export interface OutboxWorkerResult {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly deadLettered: number;
}

/** After this many attempts a message moves to DEAD_LETTER instead of being retried again. */
export const MAX_OUTBOX_ATTEMPTS = 5;

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60_000;

function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * Placeholder event->email mapping: the real notification templates/
 * recipients are a Phase 5/6 content decision, not yet made. This turns any
 * outbox event into a minimal, generic notification so the dispatch/retry/
 * dead-letter mechanics (CLAUDE.md: "transactional outbox for notifications
 * and externally visible asynchronous effects") can be implemented and
 * tested now.
 */
function toEmailMessage(message: OutboxMessage): { to: string; subject: string; textBody: string } {
  return {
    to: 'ops@eramix.invalid',
    subject: `[${message.aggregateType}] ${message.eventType}`,
    textBody: JSON.stringify(message.payload),
  };
}

const CANONICAL_URL_EVENT_TYPES: ReadonlySet<string> = new Set([
  'category.status_changed',
  'content.status_changed',
  'product.status_changed',
]);

function eligibleCanonicalUrls(message: OutboxMessage): readonly string[] | undefined {
  if (!CANONICAL_URL_EVENT_TYPES.has(message.eventType)) {
    return undefined;
  }
  const payload = message.payload as { newStatus?: unknown; canonicalUrls?: unknown };
  if (payload.newStatus !== 'PUBLISHED' || !Array.isArray(payload.canonicalUrls)) {
    return undefined;
  }
  const urls = payload.canonicalUrls.filter((url): url is string => typeof url === 'string');
  return urls.length > 0 ? urls : undefined;
}

/**
 * Best-effort, independent of the message's own SENT/FAILED/DEAD_LETTER
 * outcome (CLAUDE.md: IndexNow "never replaces sitemap/canonical
 * correctness" — it is a secondary notification, not the source of truth).
 * Never throws: a submission failure is logged, not retried through the
 * outbox's own retry/backoff state machine (HttpIndexNowNotifier already
 * bounds its own per-engine retry).
 */
async function maybeSubmitIndexNow(deps: OutboxWorkerDeps, message: OutboxMessage): Promise<void> {
  const urlPaths = eligibleCanonicalUrls(message);
  if (!urlPaths || !deps.indexNow || !deps.settingsRepo || !deps.indexNowKey) {
    return;
  }
  try {
    const settings = await deps.settingsRepo.get();
    if (!settings.indexNowEnabled) {
      return;
    }
    const origin = buildCanonicalOrigin(settings);
    const results = await deps.indexNow.submit({
      host: settings.canonicalHost,
      key: deps.indexNowKey,
      keyLocation: `${origin}/api/seo/indexnow-key.txt`,
      urlList: urlPaths.map((path) => `${origin}${path}`),
    });
    deps.logger.log('info', 'indexnow_submitted', {
      messageId: message.id,
      eventType: message.eventType,
      urlCount: urlPaths.length,
      results,
    });
  } catch (error) {
    deps.logger.log('warn', 'indexnow_submission_failed', {
      messageId: message.id,
      eventType: message.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Dispatches one `analytics.event_captured` message to every registered
 * sink (packages/application/src/analytics.ts's dispatchAnalyticsEvent does
 * the per-sink consent/enablement gating). Sinks never throw for their own
 * delivery failure, so this only throws for a genuinely unexpected error
 * (e.g. a settings-read failure) — which the caller's normal retry/backoff/
 * dead-letter handling then applies, same as any other message type.
 */
async function dispatchAnalyticsEventMessage(
  deps: OutboxWorkerDeps,
  message: OutboxMessage,
): Promise<void> {
  if (!deps.analyticsSinks || deps.analyticsSinks.length === 0 || !deps.settingsRepo) {
    return;
  }
  const event = message.payload as unknown as AnalyticsEvent;
  // Re-validated here (not just trusted from the ingestion endpoint): the
  // outbox is a durable queue a message can sit in for a while, and this is
  // the last gate before an event ever reaches a third-party destination.
  validateAnalyticsEvent(event, deps.clock.now());
  const results = await dispatchAnalyticsEvent(
    { sinks: deps.analyticsSinks, settingsRepo: deps.settingsRepo },
    event,
  );
  deps.logger.log('info', 'analytics_event_dispatched', {
    messageId: message.id,
    eventName: event.eventName,
    results,
  });
  await recordSinkStatuses(deps, results);
}

/**
 * Best-effort admin-diagnostic snapshot (CLAUDE.md: "last safe delivery
 * result"). A skipped result (consent/enablement absent) is recorded too —
 * "was never even attempted" is itself a meaningful diagnostic state, not
 * something to omit. A write failure here is logged but never rethrown:
 * this must never turn a successful analytics dispatch into a
 * retried/dead-lettered outbox message.
 */
async function recordSinkStatuses(
  deps: OutboxWorkerDeps,
  results: readonly {
    readonly sink: string;
    readonly succeeded: boolean;
    readonly skipped?: boolean;
    readonly error?: string;
  }[],
): Promise<void> {
  if (!deps.analyticsSinkStatusRepo) {
    return;
  }
  const now = deps.clock.now();
  for (const result of results) {
    try {
      await deps.analyticsSinkStatusRepo.recordResult({
        sink: result.sink,
        lastAttemptAt: now,
        lastSucceeded: result.succeeded,
        lastSkipped: result.skipped ?? false,
        lastError: result.error,
      });
    } catch (error) {
      deps.logger.log('warn', 'analytics_sink_status_record_failed', {
        sink: result.sink,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Claims one batch of due outbox messages (PENDING or backed-off FAILED)
 * and dispatches each: SENT on success; FAILED with exponential backoff on
 * a retryable failure; DEAD_LETTER once MAX_OUTBOX_ATTEMPTS is reached
 * (never retried again automatically past that point).
 */
export async function processOutboxBatch(
  deps: OutboxWorkerDeps,
  batchSize = 20,
): Promise<OutboxWorkerResult> {
  const messages = await deps.outbox.claimPending(batchSize);
  let sent = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const message of messages) {
    try {
      if (message.eventType === 'analytics.event_captured') {
        await dispatchAnalyticsEventMessage(deps, message);
      } else {
        await deps.email.send(toEmailMessage(message));
      }
      await deps.outbox.markSent(message.id);
      sent += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const nextAttempt = message.attempts + 1;

      if (nextAttempt >= MAX_OUTBOX_ATTEMPTS) {
        await deps.outbox.markDeadLetter(message.id, errorMessage);
        deps.logger.log('error', 'outbox_dead_lettered', {
          messageId: message.id,
          eventType: message.eventType,
          attempts: nextAttempt,
        });
        deadLettered += 1;
      } else {
        const nextAvailableAt = new Date(deps.clock.now().getTime() + backoffFor(nextAttempt));
        await deps.outbox.markFailed(message.id, errorMessage, nextAvailableAt);
        deps.logger.log('warn', 'outbox_retry_scheduled', {
          messageId: message.id,
          eventType: message.eventType,
          attempts: nextAttempt,
          nextAvailableAt: nextAvailableAt.toISOString(),
        });
        retried += 1;
      }
    }

    await maybeSubmitIndexNow(deps, message);
  }

  return { claimed: messages.length, sent, retried, deadLettered };
}
