import { catalogueEntryFor, problemTypeFor, type ProblemDetails } from '@eramix/contracts';
import { JsonLogger } from '@eramix/infrastructure';
import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin } from './csrf';
import { problemResponse } from './problem-response';
import { traceIdFromRequest } from './trace';

const logger = new JsonLogger();

type RouteContext<Params> = { params: Promise<Params> };
type ApiHandler<Params> = (
  request: NextRequest,
  traceId: string,
  context: RouteContext<Params>,
) => Promise<NextResponse>;
type RouteHandler<Params> = (
  request: NextRequest,
  context: RouteContext<Params>,
) => Promise<NextResponse>;

/**
 * Every method Next.js 16 route files may implement, excluding HEAD/OPTIONS
 * — Next auto-implements both correctly on its own (HEAD from GET, OPTIONS
 * with a correct Allow header — verified against the installed
 * `next@16.2.12` package source) and must not be overridden here.
 */
const STANDARD_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type StandardMethod = (typeof STANDARD_METHODS)[number];

/**
 * Wraps a route handler with: W3C trace-id propagation (threaded into
 * RFC 9457 responses and structured logs), and structured JSON access
 * logging (route/status/durationMs/traceId — never a request/response body,
 * so nothing sensitive is ever logged). Every route in apps/web/src/app/api
 * uses this instead of its own try/catch so the observability and error
 * mapping behaviour is uniform (CLAUDE.md: structured logs with trace
 * correlation, RFC 9457 everywhere).
 */
export function withApiHandler<Params = Record<string, never>>(
  routeName: string,
  handler: ApiHandler<Params>,
) {
  return async (request: NextRequest, context: RouteContext<Params>): Promise<NextResponse> => {
    const traceId = traceIdFromRequest(request);
    const startedAt = Date.now();
    try {
      assertSameOrigin(request);
      const response = await handler(request, traceId, context);
      logger.log('info', 'http_request', {
        traceId,
        route: routeName,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const response = problemResponse(error, traceId);
      logger.log(response.status >= 500 ? 'error' : 'warn', 'http_request_failed', {
        traceId,
        route: routeName,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }
  };
}

/**
 * RFC 9110 §15.5.6-compliant 405 (docs/runbooks/http-error-contract.md,
 * ADR-0020) — Next.js 16's own default 405 (verified against the
 * installed `next@16.2.12` package source,
 * `auto-implement-methods.js`'s `handleMethodNotAllowedResponse`) returns
 * a bare, headerless response with no `Allow` header, which this contract
 * requires. Not exported directly for route files to use one-off; use
 * `defineRouteHandlers()` instead so the `Allow` list is always derived
 * from the same object, never hand-typed twice.
 */
function methodNotAllowed<Params>(allowed: readonly StandardMethod[]): RouteHandler<Params> {
  const allowHeader = [...allowed].sort().join(', ');
  return (request: NextRequest): Promise<NextResponse> => {
    const traceId = traceIdFromRequest(request);
    const entry = catalogueEntryFor('METHOD_NOT_ALLOWED');
    const problem: ProblemDetails = {
      type: problemTypeFor('METHOD_NOT_ALLOWED'),
      title: entry.meaning,
      status: entry.status,
      code: 'METHOD_NOT_ALLOWED',
      detail: `${request.method} is not supported on this endpoint. Supported: ${allowHeader}.`,
      traceId,
    };
    logger.log('warn', 'http_request_failed', {
      traceId,
      route: 'method_not_allowed',
      method: request.method,
      status: entry.status,
      durationMs: 0,
    });
    return Promise.resolve(
      NextResponse.json(problem, {
        status: entry.status,
        headers: { 'content-type': 'application/problem+json', Allow: allowHeader },
      }),
    );
  };
}

/**
 * Every `route.ts` file should export its handlers through this function
 * instead of individual `export const GET = ...`/`export const POST = ...`
 * statements: it fills in every standard method the file does not
 * implement with a correct, tested `methodNotAllowed()` handler, so a
 * route can never silently fall back to Next's non-compliant bare-405
 * default. Rollout across all route files is incremental (tracked in
 * docs/runbooks/http-error-contract.md's implementation-status table) —
 * a route file not yet migrated still uses individual `export const`
 * statements and Next's default 405, a known, tracked gap.
 *
 * Because this always exports a real function for every standard method
 * (even the unimplemented ones, now answering 405), Next.js's own method-
 * presence detection can no longer tell "genuinely implemented" from "our
 * 405 stub" apart — its own OPTIONS auto-implementation would incorrectly
 * list every standard method as allowed. The returned `OPTIONS` handler
 * here (built from the *true* `implemented` set, before stubbing)
 * overrides that: Next only auto-implements OPTIONS "if
 * (!handlers.OPTIONS)" (verified against the installed `next@16.2.12`
 * package source), so exporting one here always wins.
 */
export function defineRouteHandlers<Params = Record<string, never>>(
  handlers: Partial<Record<StandardMethod, RouteHandler<Params>>>,
): Record<StandardMethod, RouteHandler<Params>> & { OPTIONS: RouteHandler<Params> } {
  const implemented = STANDARD_METHODS.filter((method) => handlers[method] !== undefined);
  const notAllowed = methodNotAllowed<Params>(implemented);
  const optionsAllow = [...implemented, 'OPTIONS', ...(implemented.includes('GET') ? ['HEAD'] : [])]
    .sort()
    .join(', ');

  return {
    ...(Object.fromEntries(
      STANDARD_METHODS.map((method) => [method, handlers[method] ?? notAllowed]),
    ) as Record<StandardMethod, RouteHandler<Params>>),
    OPTIONS: () =>
      Promise.resolve(new NextResponse(null, { status: 204, headers: { Allow: optionsAllow } })),
  };
}
