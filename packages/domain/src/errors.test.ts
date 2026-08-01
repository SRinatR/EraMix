import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  CanonicalRouteMissingError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  OrderStateConflictError,
  SlugConflictError,
} from './errors.js';

describe('typed domain errors', () => {
  it.each([
    [AccessDeniedError, 'ACCESS_DENIED'],
    [OrderStateConflictError, 'ORDER_STATE_CONFLICT'],
    [ConcurrencyConflictError, 'CONCURRENCY_CONFLICT'],
    [IdempotencyConflictError, 'IDEMPOTENCY_CONFLICT'],
    [SlugConflictError, 'SLUG_CONFLICT'],
    [CanonicalRouteMissingError, 'CANONICAL_ROUTE_MISSING'],
  ] as const)('%s carries code %s and is an Error/DomainError instance', (ErrorClass, code) => {
    const error = new ErrorClass('boom', { entityId: 'abc' });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.details).toEqual({ entityId: 'abc' });
  });
});
