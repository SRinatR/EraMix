import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStoredConsent } from './consent-store.js';
import { sendAnalyticsEvent } from './analytics-client.js';

/** Same minimal cookie-jar stub as consent-store.test.ts — see that file's own comment for why. */
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

describe('sendAnalyticsEvent — consent read from the real store, not hardcoded', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installCookieJar();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastRequestBody(): { events: Record<string, unknown>[] } {
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return JSON.parse(init.body as string) as { events: Record<string, unknown>[] };
  }

  it('sends withheld consent ({analytics:false, advertising:false}) when no choice has ever been recorded', () => {
    sendAnalyticsEvent('en', { eventName: 'page_view', pageType: 'home', canonicalPath: '/en' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analytics/events',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
    const body = lastRequestBody();
    expect(body.events[0]?.['consent']).toEqual({ analytics: false, advertising: false });
  });

  it('sends the real granted consent once the visitor has made a choice', () => {
    setStoredConsent({ analytics: true, advertising: false });

    sendAnalyticsEvent('en', { eventName: 'page_view', pageType: 'home', canonicalPath: '/en' });

    const body = lastRequestBody();
    expect(body.events[0]?.['consent']).toEqual({ analytics: true, advertising: false });
  });

  it('never throws even when fetch itself rejects (fire-and-forget, non-blocking)', () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(() =>
      sendAnalyticsEvent('en', { eventName: 'page_view', pageType: 'home', canonicalPath: '/en' }),
    ).not.toThrow();
  });
});
