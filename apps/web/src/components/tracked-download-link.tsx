'use client';

import type { LocaleCode, PageType } from '@eramix/domain';
import type { ReactNode } from 'react';
import { sendAnalyticsEvent } from './analytics-client';

/**
 * Fires `file_download` on click, then lets the browser's own navigation to
 * `href` proceed unchanged (never `preventDefault`) — a delivery failure or
 * ad-blocker must never affect the download itself (CLAUDE.md: "non-blocking
 * delivery").
 */
export function TrackedDownloadLink({
  href,
  assetId,
  productPublicId,
  locale,
  pageType,
  canonicalPath,
  children,
}: {
  readonly href: string;
  readonly assetId: string;
  readonly productPublicId?: string;
  readonly locale: LocaleCode;
  readonly pageType: PageType;
  readonly canonicalPath: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={() =>
        sendAnalyticsEvent(locale, {
          eventName: 'file_download',
          pageType,
          canonicalPath,
          assetId,
          ...(productPublicId !== undefined ? { productPublicId } : {}),
        })
      }
    >
      {children}
    </a>
  );
}
