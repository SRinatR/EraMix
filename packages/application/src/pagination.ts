// packages/application declares no @types/node/DOM lib dependency (matches
// packages/domain's platform-agnostic convention) — these ambient
// declarations type the Web-standard base64 globals every target runtime
// (Node 18+, browsers, edge) already provides, without pulling in a type
// package this package otherwise has no use for.
declare function btoa(data: string): string;
declare function atob(data: string): string;
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare class TextDecoder {
  decode(input: Uint8Array): string;
}

/**
 * ADR-0017 (TZ API-005: "Пагинация больших коллекций cursor-based";
 * §8.1: "Для коллекций используется единый envelope: data, page.nextCursor,
 * page.hasMore") / DB-005 (bounded queries) / ADM-002 (server-side
 * pagination): every list-shaped repository method funnels its `limit`
 * through `clampLimit` and returns this exact envelope shape. Deliberately
 * forward-only (no `prevCursor`) — the spec names only `nextCursor`/
 * `hasMore`; see the ADR for why a bidirectional cursor is not invented
 * here.
 */
export interface CursorPage<T> {
  readonly data: readonly T[];
  readonly page: {
    readonly nextCursor?: string;
    readonly hasMore: boolean;
  };
}

export interface CursorPaginationInput {
  readonly cursor?: string;
  readonly limit?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function clampLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

/**
 * `v` is the value of whatever field the caller is currently sorted by
 * (e.g. a `createdAt` ISO string, a `legalName`); `id` is always the
 * tiebreaker, so pagination stays stable when the sort field has
 * duplicate values. Never a raw database offset.
 */
export interface DecodedCursor {
  readonly v: string | number;
  readonly id: string;
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Opaque to every caller — never construct or parse this outside this module; always pass a received cursor back verbatim. */
export function encodeCursor(cursor: DecodedCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

function isDecodedCursor(value: unknown): value is DecodedCursor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'id' in value &&
    (typeof (value as { v: unknown }).v === 'string' ||
      typeof (value as { v: unknown }).v === 'number') &&
    typeof (value as { id: unknown }).id === 'string'
  );
}

/** Returns `undefined` for a missing/malformed/tampered cursor rather than throwing — degrades to "first page," never a 500. */
export function decodeCursor(value: string | undefined): DecodedCursor | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    return isDecodedCursor(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds the `{data, page}` envelope from a batch fetched with `take:
 * limit + 1` (the standard over-fetch-by-one pattern — avoids a separate
 * COUNT query, which is exactly what API-005/DB-005 want avoided at scale).
 */
export function buildCursorPage<T>(
  rows: readonly T[],
  limit: number,
  cursorFor: (item: T) => DecodedCursor,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    page: {
      hasMore,
      ...(hasMore && last !== undefined ? { nextCursor: encodeCursor(cursorFor(last)) } : {}),
    },
  };
}
