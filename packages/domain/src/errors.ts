export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'ORDER_STATE_CONFLICT'
  | 'CONCURRENCY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SLUG_CONFLICT'
  | 'LOCALE_NOT_SUPPORTED'
  | 'CANONICAL_ROUTE_MISSING'
  | 'AUTH_REQUIRED'
  | 'AUTH_CALLBACK_FAILED'
  | 'COMPANY_REQUIRED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE';

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

/** Thrown by validateUpload() when a file's size is outside the allowed range (docs/runbooks/http-error-contract.md — 413). */
export class PayloadTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE' as const;
}

/** Thrown by validateUpload() when a file's declared content type is not in the allowlist (docs/runbooks/http-error-contract.md — 415). A declared-vs-actual content mismatch (extension/signature) stays ValidationFailedError/422 — the type itself is supported, the payload just does not match its own claim. */
export class UnsupportedMediaTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE' as const;
}

/** Thrown when a protected use case is invoked without a valid session. */
export class AuthRequiredError extends DomainError {
  readonly code = 'AUTH_REQUIRED' as const;
}

/** Thrown when the OIDC callback fails state/nonce/PKCE/signature/issuer/audience/expiry validation. */
export class AuthCallbackFailedError extends DomainError {
  readonly code = 'AUTH_CALLBACK_FAILED' as const;
}

/** Thrown when a B2B use case requires an active company membership the actor does not have. */
export class CompanyRequiredError extends DomainError {
  readonly code = 'COMPANY_REQUIRED' as const;
}

/**
 * Thrown by a rate limiter guard on a protected endpoint (auth, search,
 * order submission, uploads, admin — CLAUDE.md security policy). Carries
 * `retryAfterSeconds` in `details` so the delivery layer can set a
 * `Retry-After` header.
 */
export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED' as const;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, { retryAfterSeconds });
  }
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
