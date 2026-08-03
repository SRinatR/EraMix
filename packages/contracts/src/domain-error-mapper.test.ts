import { LocaleNotSupportedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { toProblemDetails } from './domain-error-mapper.js';

describe('toProblemDetails', () => {
  it('maps a typed domain error to an RFC 9457 problem with the catalogued status and code', () => {
    const error = new LocaleNotSupportedError('Locale "fr" is not supported.', {
      value: 'fr',
    });

    const problem = toProblemDetails(error, 'trace-123');

    expect(problem.code).toBe('LOCALE_NOT_SUPPORTED');
    // 422, not 404: parseLocale() (the only real thrower) is only ever
    // called on a body/form field (docs/runbooks/http-error-contract.md,
    // ADR-0020) — URL locale segments use isSupportedLocale()/notFound()
    // directly and never construct this error.
    expect(problem.status).toBe(422);
    expect(problem.type).toBe('https://eramix.dev/problems/locale-not-supported');
    expect(problem.traceId).toBe('trace-123');
    expect(problem.detail).toBe('Locale "fr" is not supported.');
  });
});
