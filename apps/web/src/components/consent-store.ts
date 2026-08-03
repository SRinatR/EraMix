'use client';

import {
  CONSENT_POLICY_VERSION,
  isConsentCurrent,
  type ConsentChoice,
  type StoredConsent,
} from '@eramix/domain';

/**
 * A plain (non-HttpOnly) cookie — this is a visitor preference the client
 * must be able to read/write itself, never a session/auth credential
 * (CLAUDE.md's HttpOnly requirement applies to session cookies, not this
 * one). `SameSite=Lax`, one-year lifetime, no `Secure` flag hardcoded (this
 * repository's own established `isSecureRequest`-style lesson: a hardcoded
 * `Secure` attribute would silently drop the cookie on a non-HTTPS dev/demo
 * origin) — the browser already refuses a `Secure` cookie over plain HTTP,
 * so omitting it here is the same "works everywhere" default the session
 * cookie code arrived at after a real incident.
 */
const COOKIE_NAME = 'eramix_consent';
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = document.cookie.split('; ').find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

/** Returns undefined when no consent has ever been recorded, or the stored record is from a superseded policy version — both cases must re-prompt, never silently assume withheld-forever or granted-forever. */
export function getStoredConsent(): StoredConsent | undefined {
  const raw = readCookie(COOKIE_NAME);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as StoredConsent;
    return isConsentCurrent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function setStoredConsent(choice: ConsentChoice): void {
  const record: StoredConsent = {
    ...choice,
    version: CONSENT_POLICY_VERSION,
    grantedAt: new Date().toISOString(),
  };
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(record))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** Withdrawal: deletes the cookie outright rather than writing an all-false record, so getStoredConsent() correctly reports "no choice on file" and the banner re-prompts on the next visit. */
export function clearStoredConsent(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}
