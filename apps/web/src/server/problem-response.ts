import { DomainError } from '@eramix/domain';
import {
  catalogueEntryFor,
  problemTypeFor,
  toProblemDetails,
  type ProblemDetails,
} from '@eramix/contracts';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

const PROBLEM_JSON_HEADERS = { 'content-type': 'application/problem+json' } as const;

/**
 * Maps a caught error to an RFC 9457 `application/problem+json` response
 * (docs/runbooks/http-error-contract.md, ADR-0020) — the ONLY place in
 * this codebase that builds one; a route handler must never construct its
 * own status/body for a caught error. `DomainError` subclasses map through
 * the shared catalogue (packages/contracts); a `ZodError` (delivery-
 * boundary input validation — CLAUDE.md: "Validate all external input at
 * the delivery boundary") maps to the same VALIDATION_FAILED shape with
 * per-field pointers; a `SyntaxError` from `await request.json()` (the
 * body could not even be parsed) maps to 400 MALFORMED_REQUEST — distinct
 * from a well-formed-but-invalid body (422); anything else is a genuinely
 * unexpected failure and must never leak internals (stack trace, message)
 * to the client.
 */
export function problemResponse(error: unknown, traceId?: string): NextResponse<ProblemDetails> {
  if (error instanceof DomainError) {
    const problem = toProblemDetails(error, traceId);
    const headers: Record<string, string> = { ...PROBLEM_JSON_HEADERS };
    const retryAfterSeconds = error.details?.['retryAfterSeconds'];
    if (problem.code === 'RATE_LIMITED' && typeof retryAfterSeconds === 'number') {
      headers['Retry-After'] = String(retryAfterSeconds);
    }
    return NextResponse.json(problem, { status: problem.status, headers });
  }

  if (error instanceof ZodError) {
    const entry = catalogueEntryFor('VALIDATION_FAILED');
    const problem: ProblemDetails = {
      type: problemTypeFor('VALIDATION_FAILED'),
      title: entry.meaning,
      status: entry.status,
      code: 'VALIDATION_FAILED',
      ...(traceId !== undefined ? { traceId } : {}),
      errors: error.issues.map((issue) => ({
        pointer: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    };
    return NextResponse.json(problem, { status: entry.status, headers: PROBLEM_JSON_HEADERS });
  }

  // A malformed (unparseable) JSON request body — request.json() rejects
  // with a native SyntaxError per the Fetch API spec. This is a client
  // mistake (400), never an "unexpected internal failure" (500). Note:
  // any other genuinely internal SyntaxError (there are none in this
  // codebase's own request-handling code today) would also be classified
  // as 400 by this branch — an accepted, documented tradeoff, since a
  // route handler's only realistic source of a SyntaxError is its own
  // `request.json()`/`request.formData()` call.
  if (error instanceof SyntaxError) {
    const entry = catalogueEntryFor('MALFORMED_REQUEST');
    const problem: ProblemDetails = {
      type: problemTypeFor('MALFORMED_REQUEST'),
      title: entry.meaning,
      status: entry.status,
      code: 'MALFORMED_REQUEST',
      detail: error.message,
      ...(traceId !== undefined ? { traceId } : {}),
    };
    return NextResponse.json(problem, { status: entry.status, headers: PROBLEM_JSON_HEADERS });
  }

  const entry = catalogueEntryFor('INTERNAL_ERROR');
  const problem: ProblemDetails = {
    type: problemTypeFor('INTERNAL_ERROR'),
    title: entry.meaning,
    status: entry.status,
    code: 'INTERNAL_ERROR',
    ...(traceId !== undefined ? { traceId } : {}),
  };
  return NextResponse.json(problem, { status: entry.status, headers: PROBLEM_JSON_HEADERS });
}
