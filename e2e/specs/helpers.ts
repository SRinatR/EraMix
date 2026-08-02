import type { Page, Request } from '@playwright/test';

export type TestRole = 'customer' | 'manager' | 'editor' | 'admin' | 'auditor';

/**
 * Drives a real browser through the full OIDC Authorization Code + PKCE
 * flow against scripts/pi/oidc-fake-idp.mjs — /api/auth/login, the fake
 * IdP's login-picker page, the redirect back to /api/auth/callback. This is
 * the UI-driven equivalent of scripts/pi/login-as.mjs (which is for shell
 * scripts that need a session cookie without a browser); prefer this in
 * Playwright specs so the picker page itself is also exercised.
 */
export async function loginAs(page: Page, role: TestRole): Promise<void> {
  await page.goto('/api/auth/login');
  await page.click(`button[value="${role}"]`);
  await page.waitForURL((url) => !url.pathname.startsWith('/authorize'));
}

/**
 * Clicks the account order-detail page's real "Submit order" button
 * (apps/web/src/app/[locale]/account/orders/[orderNumber]/submit-order-button.tsx)
 * — accepting the confirmation dialog it raises — and captures the exact
 * POST /api/orders/by-id/{orderId}/submit request the button sent (URL,
 * Idempotency-Key header, and body) so a caller can, if needed, replay the
 * identical request to verify server-side idempotency (a realistic network-
 * retry scenario, not a substitute for driving the button itself).
 */
export async function submitOrderViaUi(
  page: Page,
): Promise<{ request: Request; idempotencyKey: string }> {
  page.once('dialog', (dialog) => void dialog.accept());
  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/submit') && req.method() === 'POST'),
    page.getByRole('button', { name: /submit order/i }).click(),
  ]);
  const idempotencyKey = request.headers()['idempotency-key'];
  if (!idempotencyKey) {
    throw new Error('Submit order button did not send an Idempotency-Key header.');
  }
  return { request, idempotencyKey };
}

/**
 * Replays a previously captured submit request verbatim (same URL, same
 * Idempotency-Key, same body) — the same shape of request a browser or
 * intermediate proxy would resend on a timeout/network retry. Used only to
 * assert the no-op/idempotent behaviour after the real button click above.
 */
export async function replaySubmitRequest(page: Page, request: Request) {
  return page.request.post(request.url(), {
    headers: { 'Idempotency-Key': request.headers()['idempotency-key']! },
    data: request.postDataJSON(),
  });
}
