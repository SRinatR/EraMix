import { ValidationFailedError } from './errors.js';

/**
 * CLAUDE.md: HTTP 410 is emitted only for an explicit, durable "permanently
 * retired" state — never merely because content is unpublished, missing, or
 * temporarily unavailable. Retirement is a one-way admin command distinct
 * from the reversible DRAFT/PUBLISHED/ARCHIVED lifecycle (packages/
 * application/src/publication.ts enforces the ARCHIVED-first precondition
 * and blocks any further status transition once retired). This module only
 * validates the one field the command itself introduces: a real, non-empty
 * reason, so the audit trail and any future editorial review always has one.
 */
const MAX_RETIREMENT_REASON_LENGTH = 2000;

export function validateRetirementReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ValidationFailedError('A retirement reason is required.', { reason });
  }
  if (trimmed.length > MAX_RETIREMENT_REASON_LENGTH) {
    throw new ValidationFailedError(
      `Retirement reason must be at most ${MAX_RETIREMENT_REASON_LENGTH} characters.`,
      { length: trimmed.length },
    );
  }
  return trimmed;
}
