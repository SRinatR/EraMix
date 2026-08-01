export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'ORDER_STATE_CONFLICT'
  | 'CONCURRENCY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SLUG_CONFLICT'
  | 'LOCALE_NOT_SUPPORTED'
  | 'CANONICAL_ROUTE_MISSING';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;
}

export class ResourceNotFoundError extends DomainError {
  readonly code = 'RESOURCE_NOT_FOUND' as const;
}

export class LocaleNotSupportedError extends DomainError {
  readonly code = 'LOCALE_NOT_SUPPORTED' as const;
}

export class AccessDeniedError extends DomainError {
  readonly code = 'ACCESS_DENIED' as const;
}

export class OrderStateConflictError extends DomainError {
  readonly code = 'ORDER_STATE_CONFLICT' as const;
}

//Thrown by a repository adapter when an optimistic-concurrency `version`
//guard matches zero rows: the aggregate was changed by another operation
//since it was read.
export class ConcurrencyConflictError extends DomainError {
  readonly code = 'CONCURRENCY_CONFLICT' as const;
}

//Thrown when an Idempotency-Key is reused with a different request payload.
export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT' as const;
}

//Thrown when a slug is already held by a current or historical route in
//the same locale/route-type/namespace.
export class SlugConflictError extends DomainError {
  readonly code = 'SLUG_CONFLICT' as const;
}

//Thrown when a published translation is missing its canonical route — an
//internal invariant violation (DB-007/DB-008), never a user input error.
export class CanonicalRouteMissingError extends DomainError {
  readonly code = 'CANONICAL_ROUTE_MISSING' as const;
}
