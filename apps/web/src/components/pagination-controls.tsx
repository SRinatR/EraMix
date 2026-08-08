import { Link } from '@/i18n/navigation';

/**
 * ADM-002 ("Все списки имеют серверную пагинацию... явные loading/empty/
 * error states") / DB-005 ("bounded queries и пагинацию") / ADR-0017
 * (cursor-based pagination, API-005): forward-only by design — the API
 * envelope carries only `nextCursor`/`hasMore`, never a `prevCursor`, so
 * this control offers "Next" (when `hasMore`) and, once the caller has
 * scrolled past the first page, a "First page" link back to the
 * unfiltered/uncursored start. Plain links, no client JS — `basePath` must
 * already be locale-relative (next-intl's `Link` adds the locale prefix
 * itself).
 */
export function PaginationControls({
  basePath,
  page,
  currentCursor,
  extraParams = {},
  cursorParamName = 'cursor',
}: {
  readonly basePath: string;
  readonly page: { readonly hasMore: boolean; readonly nextCursor?: string };
  /** The cursor the current page was rendered with, if any — enables "First page". */
  readonly currentCursor: string | undefined;
  /** Fixed params to preserve on Next/First — e.g. the current search/sort/filter, or a sibling section's cursor on a two-list admin screen. */
  readonly extraParams?: Record<string, string>;
  /** Override when a page has more than one independently-paginated list. */
  readonly cursorParamName?: string;
}) {
  const hasNext = page.hasMore && page.nextCursor !== undefined;
  const hasFirst = currentCursor !== undefined;

  if (!hasNext && !hasFirst) {
    return null;
  }

  function hrefFor(cursor: string | undefined): string {
    const params = new URLSearchParams(extraParams);
    if (cursor !== undefined) {
      params.set(cursorParamName, cursor);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav className="pagination cluster" aria-label="Pagination">
      {hasFirst && (
        <Link href={hrefFor(undefined)} className="btn btn-secondary btn-sm">
          First page
        </Link>
      )}
      {hasNext && (
        <Link href={hrefFor(page.nextCursor)} className="btn btn-sm">
          Next
        </Link>
      )}
    </nav>
  );
}
