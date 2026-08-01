import type { Clock, EmailSender, OutboxMessageRepository } from '@eramix/application';
import type { OutboxMessage } from '@eramix/domain';
import type { Logger } from '@eramix/infrastructure';

export interface OutboxWorkerDeps {
  readonly outbox: OutboxMessageRepository;
  readonly email: EmailSender;
  readonly logger: Logger;
  readonly clock: Clock;
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
      await deps.email.send(toEmailMessage(message));
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
  }

  return { claimed: messages.length, sent, retried, deadLettered };
}
