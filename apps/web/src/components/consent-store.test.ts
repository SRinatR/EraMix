import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoredConsent, getStoredConsent, setStoredConsent } from './consent-store.js';

/**
 * This test suite runs in Vitest's plain `node` environment (no jsdom —
 * this repository has never needed a DOM test environment before), so
 * `document.cookie` is stubbed with a minimal jar that matches the real
 * browser contract closely enough for these tests: reading returns
 * `"name=value; name2=value2"`, and writing one `"name=value; attr..."`
 * string sets or (via `max-age=0`) deletes exactly that one cookie without
 * touching any other — the same semantics consent-store.ts actually relies
 * on.
 */
function installCookieJar(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return [...store.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
      },
      set cookie(raw: string) {
        const [pair] = raw.split(';');
        const eqIndex = pair!.indexOf('=');
        const name = pair!.slice(0, eqIndex);
        const value = pair!.slice(eqIndex + 1);
        const maxAgeMatch = /max-age=(\d+)/i.exec(raw);
        if (maxAgeMatch && Number(maxAgeMatch[1]) === 0) {
          store.delete(name);
        } else {
          store.set(name, value);
        }
      },
    },
  });
}

describe('consent-store', () => {
  beforeEach(() => {
    installCookieJar();
  });

  it('returns undefined when no consent has ever been recorded', () => {
    expect(getStoredConsent()).toBeUndefined();
  });

  it('round-trips a granted choice', () => {
    setStoredConsent({ analytics: true, advertising: false });

    const stored = getStoredConsent();
    expect(stored?.analytics).toBe(true);
    expect(stored?.advertising).toBe(false);
    expect(stored?.grantedAt).toBeDefined();
  });

  it('round-trips a fully-rejected choice (still a recorded choice, not the same as "no choice on file")', () => {
    setStoredConsent({ analytics: false, advertising: false });

    const stored = getStoredConsent();
    expect(stored).toBeDefined();
    expect(stored?.analytics).toBe(false);
    expect(stored?.advertising).toBe(false);
  });

  it('withdrawal: clearStoredConsent removes the record so the next read reports "no choice on file", not all-false', () => {
    setStoredConsent({ analytics: true, advertising: true });
    expect(getStoredConsent()).toBeDefined();

    clearStoredConsent();

    expect(getStoredConsent()).toBeUndefined();
  });

  it('changing preferences: a later setStoredConsent call overwrites the earlier one', () => {
    setStoredConsent({ analytics: true, advertising: false });
    setStoredConsent({ analytics: false, advertising: true });

    const stored = getStoredConsent();
    expect(stored?.analytics).toBe(false);
    expect(stored?.advertising).toBe(true);
  });

  it('treats a corrupted cookie value as no choice on file rather than throwing', () => {
    document.cookie = 'eramix_consent=not-json; path=/';
    expect(() => getStoredConsent()).not.toThrow();
    expect(getStoredConsent()).toBeUndefined();
  });
});
