import { JsonLogger } from '@eramix/infrastructure';
import { NextResponse, type NextRequest } from 'next/server';
import { problemResponse } from './problem-response';
import { traceIdFromRequest } from './trace';

const logger = new JsonLogger();

type RouteContext<Params> = { params: Promise<Params> };
type ApiHandler<Params> = (
  request: NextRequest,
  traceId: string,
  context: RouteContext<Params>,
) => Promise<NextResponse>;

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
