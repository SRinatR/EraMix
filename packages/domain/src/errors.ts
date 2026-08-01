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
