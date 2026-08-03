export interface ErrorCatalogueEntry {
  readonly code: string;
  readonly status: number;
  readonly meaning: string;
}

/**
 * Single source of truth for code -> canonical HTTP status -> stable title
 * (docs/runbooks/http-error-contract.md, ADR-0020). Exactly one `status`
 * per entry: a prior version stored `status: readonly number[]` for a few
 * codes to leave room for "maybe this, maybe that" ambiguity, but the only
 * reader (`toProblemDetails`) ever consumed the first element, so the
 * extra entries were dead and misleading. A code that is genuinely
 * context-dependent must be split into two distinct codes instead (see
 * `LOCALE_NOT_SUPPORTED`'s history below), never encoded as an array here.
 */
export const ERROR_CATALOGUE = [
  { code: 'AUTH_REQUIRED', status: 401, meaning: 'No valid session' },
  { code: 'AUTH_CALLBACK_FAILED', status: 401, meaning: 'OIDC callback failed validation' },
  { code: 'ACCESS_DENIED', status: 403, meaning: 'Insufficient permission' },
  {
    code: 'COMPANY_REQUIRED',
    status: 403,
    meaning: 'No active company for this B2B action',
  },
  {
    code: 'RESOURCE_NOT_FOUND',
    status: 404,
    meaning: 'Resource not found, or hidden by access-control policy',
  },
  { code: 'VALIDATION_FAILED', status: 422, meaning: 'Invalid request fields' },
  {
    code: 'ORDER_STATE_CONFLICT',
    status: 409,
    meaning: 'Transition is not legal from the current status',
  },
  {
    code: 'CONCURRENCY_CONFLICT',
    status: 409,
    meaning: 'Resource was changed by another operation',
  },
  {
    code: 'IDEMPOTENCY_CONFLICT',
    status: 409,
    meaning: 'Idempotency key reused with a different payload',
  },
  {
    code: 'RATE_LIMITED',
    status: 429,
    meaning: 'Rate limit exceeded; see Retry-After',
  },
  {
    code: 'DEPENDENCY_UNAVAILABLE',
    status: 503,
    meaning: 'A critical dependency is temporarily unavailable',
  },
  { code: 'INTERNAL_ERROR', status: 500, meaning: 'Unexpected internal error' },
  {
    code: 'SLUG_CONFLICT',
    status: 409,
    meaning: 'Slug is already held by a current or historical route in this locale/type',
  },
  {
    code: 'PUBLIC_ID_CONFLICT',
    status: 409,
    meaning: 'Generated public identifier collided with an existing one after exhausting retries',
  },
  {
    // Historically mapped to 404, inherited from a design that assumed
    // this code would gate URL locale segments. In fact URL locale
    // segments use isSupportedLocale()/notFound() directly and never
    // construct this error; parseLocale() (the only real thrower) is only
    // ever called on a body/form field, where a 422 is correct (ADR-0020).
    code: 'LOCALE_NOT_SUPPORTED',
    status: 422,
    meaning: 'Locale is not in the input contract’s allowlist',
  },
  {
    code: 'CANONICAL_ROUTE_MISSING',
    status: 500,
    meaning: 'Internal invariant violated on a published translation',
  },
  {
    code: 'MALFORMED_REQUEST',
    status: 400,
    meaning: 'Request body could not be parsed',
  },
  {
    code: 'PAYLOAD_TOO_LARGE',
    status: 413,
    meaning: 'Uploaded file exceeds the allowed size',
  },
  {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    status: 415,
    meaning: 'Uploaded file’s content type is not supported',
  },
  {
    code: 'METHOD_NOT_ALLOWED',
    status: 405,
    meaning: 'HTTP method is not supported on this endpoint',
  },
] as const satisfies readonly ErrorCatalogueEntry[];

export type ErrorCode = (typeof ERROR_CATALOGUE)[number]['code'];

const CATALOGUE_BY_CODE = new Map(ERROR_CATALOGUE.map((entry) => [entry.code, entry]));

/** The one lookup every producer of a Problem Details body (thrown-DomainError or manually-constructed) must use — never restate a title/status literal at a call site. */
export function catalogueEntryFor(code: ErrorCode): ErrorCatalogueEntry {
  const entry = CATALOGUE_BY_CODE.get(code);
  if (!entry) {
    throw new Error(`Error code "${code}" is missing from the error catalogue.`);
  }
  return entry;
}
