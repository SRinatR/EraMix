import type { ErrorCode } from './error-catalogue.js';

export interface ProblemDetailsFieldError {
  readonly pointer: string;
  readonly code: string;
  readonly message: string;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code: ErrorCode;
  readonly traceId?: string;
  readonly errors?: readonly ProblemDetailsFieldError[];
}

export const PROBLEM_TYPE_BASE = 'https://eramix.dev/problems';

export function problemTypeFor(code: ErrorCode): string {
  return `${PROBLEM_TYPE_BASE}/${code.toLowerCase().replaceAll('_', '-')}`;
}
