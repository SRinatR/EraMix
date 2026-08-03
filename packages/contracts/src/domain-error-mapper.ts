import { DomainError } from '@eramix/domain';
import { catalogueEntryFor, type ErrorCode } from './error-catalogue.js';
import { problemTypeFor, type ProblemDetails } from './problem-details.js';

export function toProblemDetails(error: DomainError, traceId?: string): ProblemDetails {
  const code = error.code as ErrorCode;
  const entry = catalogueEntryFor(code);
  return {
    type: problemTypeFor(code),
    title: entry.meaning,
    status: entry.status,
    detail: error.message,
    code,
    ...(traceId !== undefined ? { traceId } : {}),
  };
}
