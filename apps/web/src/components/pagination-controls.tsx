import { Link } from '@/i18n/navigation';

/**
 * ADM-002 ("Все списки имеют серверную пагинацию... явные loading/empty/
 * error states") / DB-005 ("bounded queries и пагинацию"). Plain links, no
 * client JS — `basePath` must already be locale-relative (next-intl's
 * `Link` adds the locale prefix itself).
 */
export function PaginationControls({
  basePath,
  total,
  limit,
  offset,
  extraParams = {},
  limitParamName = 'limit',
  offsetParamName = 'offset',
}: {
  readonly basePath: string;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  /** Fixed params to preserve on Prev/Next — e.g. a sibling section's current page on a two-list admin screen. */
  readonly extraParams?: Record<string, string>;
  /** Override when a page has more than one independently-paginated list. */
  readonly limitParamName?: string;
  readonly offsetParamName?: string;
}) {
  if (total === 0) {
    return <p>No results.</p>;
  }

  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  function hrefFor(newOffset: number): string {
    const params = new URLSearchParams({
      ...extraParams,
      [limitParamName]: String(limit),
      [offsetParamName]: String(newOffset),
    });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <nav aria-label="Pagination">
      <p>
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </p>
      {hasPrev && <Link href={hrefFor(Math.max(offset - limit, 0))}>Previous</Link>}
      {hasNext && <Link href={hrefFor(offset + limit)}>Next</Link>}
    </nav>
  );
}
