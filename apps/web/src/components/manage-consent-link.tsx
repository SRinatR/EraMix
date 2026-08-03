'use client';

import { OPEN_CONSENT_BANNER_EVENT } from './consent-banner';

/** Withdrawal handling (CLAUDE.md): a visitor who already made a choice must be able to reopen the banner and change it, not just see it once on first visit. */
export function ManageConsentLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_BANNER_EVENT))}
    >
      Cookie preferences
    </button>
  );
}
