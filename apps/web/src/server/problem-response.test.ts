import { RateLimitedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { problemResponse } from './problem-response.js';

describe('problemResponse', () => {
  it('maps a DomainError through the catalogue, with traceId and no Retry-After for a non-rate-limit code', async () => {
    const response = problemResponse(new ResourceNotFoundError('Product not found.'), 'trace-1');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('retry-after')).toBeNull();
    const body = await response.json();
    expect(body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
      detail: 'Product not found.',
      traceId: 'trace-1',
    });
  });

  it('maps ValidationFailedError to 422', async () => {
    const response = problemResponse(new ValidationFailedError('Bad field.'));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('sets Retry-After from RateLimitedError.details.retryAfterSeconds', async () => {
    const response = problemResponse(new RateLimitedError('Too many requests.', 42));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    const body = await response.json();
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('maps a ZodError to 422 VALIDATION_FAILED with a per-field errors array and an English title', async () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' });
    expect(result.success).toBe(false);
    const response = problemResponse(result.error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.title).toBe('Invalid request fields');
    expect(body.errors).toEqual([expect.objectContaining({ pointer: 'name' })]);
  });

  it('maps a body-parse SyntaxError to 400 MALFORMED_REQUEST, not 500', async () => {
    let syntaxError: SyntaxError;
    try {
      JSON.parse('not json');
      throw new Error('expected JSON.parse to throw');
    } catch (error) {
      syntaxError = error as SyntaxError;
    }
    const response = problemResponse(syntaxError, 'trace-2');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'MALFORMED_REQUEST', status: 400, traceId: 'trace-2' });
  });

  it('maps a genuinely unexpected error to a safe 500 with no leaked message or stack, and an English title', async () => {
    const response = problemResponse(new Error('sensitive internal detail: db password xyz'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(body.title).toBe('Unexpected internal error');
    expect(JSON.stringify(body)).not.toContain('sensitive internal detail');
  });
});
