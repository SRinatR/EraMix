import { DomainError } from '@eramix/domain';
import { ERROR_CATALOGUE, type ErrorCode } from './error-catalogue.js';
import { problemTypeFor, type ProblemDetails } from './problem-details.js';

const catalogueByCode = new Map(ERROR_CATALOGUE.map((entry) => [entry.code, entry]));

export function toProblemDetails(error: DomainError, traceId?: string): ProblemDetails {
  const code = error.code as ErrorCode;
  const entry = catalogueByCode.get(code);
  if (!entry) {
    throw new Error(`Domain error code "${code}" is missing from the error catalogue.`);
  }
  return {
    type: problemTypeFor(code),
    title: entry.meaning,
    status: entry.status[0],
    detail: error.message,
    code,
    ...(traceId !== undefined ? { traceId } : {}),
  };
}
