import { DomainError } from '@eramix/domain';
import { problemTypeFor, toProblemDetails, type ProblemDetails } from '@eramix/contracts';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Maps a caught error to an RFC 9457 `application/problem+json` response.
 * `DomainError` subclasses map through the shared catalogue (packages/
 * contracts); a `ZodError` (delivery-boundary input validation — CLAUDE.md:
 * "Validate all external input at the delivery boundary") maps to the same
 * VALIDATION_FAILED shape with per-field pointers; anything else is a
 * genuinely unexpected failure and must never leak internals (stack trace,
 * message) to the client.
 */
export function problemResponse(error: unknown, traceId?: string): NextResponse<ProblemDetails> {
  if (error instanceof DomainError) {
    const problem = toProblemDetails(error, traceId);
    return NextResponse.json(problem, {
      status: problem.status,
      headers: { 'content-type': 'application/problem+json' },
    });
  }

  if (error instanceof ZodError) {
    const problem: ProblemDetails = {
      type: problemTypeFor('VALIDATION_FAILED'),
      title: 'Невалидные поля запроса',
      status: 422,
      code: 'VALIDATION_FAILED',
      ...(traceId !== undefined ? { traceId } : {}),
      errors: error.issues.map((issue) => ({
        pointer: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    };
    return NextResponse.json(problem, {
      status: 422,
      headers: { 'content-type': 'application/problem+json' },
    });
  }

  const problem: ProblemDetails = {
    type: 'https://eramix.dev/problems/internal-error',
    title: 'Непредвиденная безопасно скрытая ошибка',
    status: 500,
    code: 'INTERNAL_ERROR',
    ...(traceId !== undefined ? { traceId } : {}),
  };
  return NextResponse.json(problem, {
    status: 500,
    headers: { 'content-type': 'application/problem+json' },
  });
}
