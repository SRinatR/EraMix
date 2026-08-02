import type { APIResponse, Page } from '@playwright/test';

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
 * The submit endpoint is keyed by the order's internal id
 * (POST /api/orders/by-id/{orderId}/submit), not its public orderNumber —
 * looks it up first via GET /api/orders/{orderNumber} (apps/web/src/server/
 * dto.ts's orderToDto includes `id`), exactly as a future "submit" button
 * would have to.
 */
export async function submitOrder(
  page: Page,
  orderNumber: string,
  idempotencyKey: string,
): Promise<APIResponse> {
  const getResponse = await page.request.get(`/api/orders/${orderNumber}`);
  const order = await getResponse.json();
  return page.request.post(`/api/orders/by-id/${order.id}/submit`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { expectedVersion: order.version },
  });
}
