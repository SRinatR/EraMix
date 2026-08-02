'use client';

import type { LocaleCode } from '@eramix/domain';
import { useEffect } from 'react';
import { sendAnalyticsEvent } from './analytics-client';

type TrackedEventFields = Parameters<typeof sendAnalyticsEvent>[1];

/**
 * Fires exactly one analytics event per mount (CLAUDE.md P0 events:
 * page_view, view_item, view_item_list, rfq_start). Server Components
 * cannot call browser APIs directly, so this tiny client island is
 * embedded once per triggering page — it renders nothing. `fields` must be
 * a stable/memoized value from the caller (a fresh object literal on every
 * render would still only fire once thanks to the mount-only effect, but
 * pass a value shaped consistently to avoid confusing the dependency list).
 */
export function AnalyticsEventTracker({
  locale,
  fields,
}: {
  readonly locale: LocaleCode;
  readonly fields: TrackedEventFields;
}) {
  // fields is a plain object rebuilt each render from primitive props at
  // the call site; JSON.stringify keeps the effect from re-firing unless
  // the actual tracked values change (mirrors PageViewTracker's own
  // primitive-dependency-list convention for the single-field case).
  const fieldsKey = JSON.stringify(fields);

  useEffect(() => {
    sendAnalyticsEvent(locale, fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, fieldsKey]);

  return null;
}
