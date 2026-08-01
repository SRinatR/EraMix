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
    expect(problem.status).toBe(404);
    expect(problem.type).toBe('https://eramix.dev/problems/locale-not-supported');
    expect(problem.traceId).toBe('trace-123');
    expect(problem.detail).toBe('Locale "fr" is not supported.');
  });
});
