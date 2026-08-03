'use client';

import { useEffect, useState } from 'react';
import { getStoredConsent, setStoredConsent } from './consent-store';

/** Dispatched by ManageConsentLink to reopen the banner after an initial choice was already made — no global state/context provider needed for a single boolean. */
export const OPEN_CONSENT_BANNER_EVENT = 'eramix:open-consent-banner';

/**
 * Real consent UI/state (CLAUDE.md), rendered once per locale layout.
 * Withheld-by-default until the visitor makes an explicit choice — nothing
 * analytics-related is ever sent with `analytics: true`/`advertising: true`
 * before this component has actually recorded a choice
 * (apps/web/src/components/analytics-client.ts reads the same stored
 * record this writes).
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      setVisible(true);
      return;
    }
    setAnalytics(stored.analytics);
    setAdvertising(stored.advertising);

    function handleReopen(): void {
      const current = getStoredConsent();
      setAnalytics(current?.analytics ?? false);
      setAdvertising(current?.advertising ?? false);
      setVisible(true);
    }
    window.addEventListener(OPEN_CONSENT_BANNER_EVENT, handleReopen);
    return () => window.removeEventListener(OPEN_CONSENT_BANNER_EVENT, handleReopen);
  }, []);

  function save(choice: { analytics: boolean; advertising: boolean }): void {
    setStoredConsent(choice);
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div role="dialog" aria-modal="false" aria-label="Cookie and privacy preferences">
      <p>
        We use cookies for essential site operation and, only with your consent, for analytics and
        advertising measurement. You can change this choice at any time.
      </p>
      <fieldset>
        <legend>Preferences</legend>
        <label>
          <input
            type="checkbox"
            checked={analytics}
            onChange={(event) => setAnalytics(event.target.checked)}
          />
          Analytics (helps us understand which pages and products are useful)
        </label>
        <label>
          <input
            type="checkbox"
            checked={advertising}
            onChange={(event) => setAdvertising(event.target.checked)}
          />
          Advertising measurement
        </label>
      </fieldset>
      <button type="button" onClick={() => save({ analytics: true, advertising: true })}>
        Accept all
      </button>
      <button type="button" onClick={() => save({ analytics: false, advertising: false })}>
        Reject non-essential
      </button>
      <button type="button" onClick={() => save({ analytics, advertising })}>
        Save preferences
      </button>
    </div>
  );
}
