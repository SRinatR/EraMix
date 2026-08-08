'use client';

import { useTranslations } from 'next-intl';
import { OPEN_CONSENT_BANNER_EVENT } from './consent-banner';

/** Withdrawal handling (CLAUDE.md): a visitor who already made a choice must be able to reopen the banner and change it, not just see it once on first visit. */
export function ManageConsentLink() {
  const t = useTranslations('Consent');
  return (
    <button
      type="button"
      className="btn-link"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_BANNER_EVENT))}
    >
      {t('manageLink')}
    </button>
  );
}
