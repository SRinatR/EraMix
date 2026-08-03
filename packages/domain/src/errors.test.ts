import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AuthCallbackFailedError,
  AuthRequiredError,
  CanonicalRouteMissingError,
  CompanyRequiredError,
  ConcurrencyConflictError,
  DependencyUnavailableError,
  IdempotencyConflictError,
  OrderStateConflictError,
  PayloadTooLargeError,
  RateLimitedError,
  SlugConflictError,
  UnsupportedMediaTypeError,
} from './errors.js';

describe('typed domain errors', () => {
  it.each([
    [AccessDeniedError, 'ACCESS_DENIED'],
    [OrderStateConflictError, 'ORDER_STATE_CONFLICT'],
    [ConcurrencyConflictError, 'CONCURRENCY_CONFLICT'],
    [IdempotencyConflictError, 'IDEMPOTENCY_CONFLICT'],
    [SlugConflictError, 'SLUG_CONFLICT'],
    [CanonicalRouteMissingError, 'CANONICAL_ROUTE_MISSING'],
    [AuthRequiredError, 'AUTH_REQUIRED'],
    [AuthCallbackFailedError, 'AUTH_CALLBACK_FAILED'],
    [CompanyRequiredError, 'COMPANY_REQUIRED'],
    [PayloadTooLargeError, 'PAYLOAD_TOO_LARGE'],
    [UnsupportedMediaTypeError, 'UNSUPPORTED_MEDIA_TYPE'],
    [DependencyUnavailableError, 'DEPENDENCY_UNAVAILABLE'],
  ] as const)('%s carries code %s and is an Error/DomainError instance', (ErrorClass, code) => {
    const error = new ErrorClass('boom', { entityId: 'abc' });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.details).toEqual({ entityId: 'abc' });
  });

  it('RateLimitedError carries retryAfterSeconds in details for a Retry-After header', () => {
    const error = new RateLimitedError('Too many requests.', 30);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.details).toEqual({ retryAfterSeconds: 30 });
  });
});
