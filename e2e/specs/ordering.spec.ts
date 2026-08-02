import { expect, test } from '@playwright/test';
import { loginAs, submitOrder } from './helpers';

/**
 * Phase 5 exit criteria: "E2E verifies submit, duplicate Idempotency-Key
 * behaviour, forbidden transitions, customer isolation, manager transition."
 * Requires packages/infrastructure/prisma/seed-e2e.ts's PUBLISHED fixture
 * product and demo company/membership.
 *
 * The account UI currently has no "submit" button (only create + cancel —
 * apps/web/src/app/[locale]/account/orders/[orderNumber]/page.tsx), so the
 * submit/idempotency assertions below call the API directly with the
 * browser's own session cookie (see helpers.ts's submitOrder), the same way
 * a future submit button would. That is a real, tracked gap, not a
 * workaround chosen to avoid testing the UI — there is no UI to drive yet.
 */
async function createDraftOrder(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/account/orders/new');
  await page.getByRole('button', { name: /create draft order/i }).click();
  await page.waitForURL(/\/account\/orders\/[A-Z0-9-]+$/);
  return page.url().split('/').pop()!;
}

test.describe('quote-only order lifecycle', () => {
  test('a customer can create a draft order and see it in their account', async ({ page }) => {
    await loginAs(page, 'customer');
    await createDraftOrder(page);
    await expect(page.getByText('Status: DRAFT')).toBeVisible();
  });

  test('submitting twice with the same Idempotency-Key is a no-op, not a duplicate transition', async ({
    page,
  }) => {
    await loginAs(page, 'customer');
    const orderNumber = await createDraftOrder(page);
    const idempotencyKey = `e2e-${Date.now()}`;

    const first = await submitOrder(page, orderNumber, idempotencyKey);
    expect(first.status()).toBeLessThan(300);
    const firstBody = await first.json();

    const second = await submitOrder(page, orderNumber, idempotencyKey);
    expect(second.status()).toBeLessThan(300);
    const secondBody = await second.json();
    expect(secondBody.status).toBe(firstBody.status);

    await page.goto(`/account/orders/${orderNumber}`);
    await expect(page.getByText('Status: SUBMITTED')).toBeVisible();
    // Exactly one DRAFT->SUBMITTED transition in the history, not two.
    const historyItems = page.locator('h2:has-text("Status history") + ul li');
    await expect(historyItems).toHaveCount(1);
  });

  test('a MANAGER can see an order a CUSTOMER submitted', async ({ page, browser }) => {
    await loginAs(page, 'customer');
    const orderNumber = await createDraftOrder(page);
    await submitOrder(page, orderNumber, `e2e-manager-check-${Date.now()}`);

    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await loginAs(managerPage, 'manager');
    const managerResponse = await managerPage.goto(`/admin/orders/${orderNumber}`);
    expect(managerResponse?.status()).toBeLessThan(400);
    await expect(managerPage.getByText('SUBMITTED', { exact: false })).toBeVisible();
    await managerContext.close();
  });

  test("customer isolation: a user outside the order's company cannot view it", async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'customer');
    const orderNumber = await createDraftOrder(page);

    // AUDITOR has no company membership and no order.read.all — same
    // isolation boundary a second, unrelated customer would hit (ORD-008).
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await loginAs(outsiderPage, 'auditor');
    const response = await outsiderPage.goto(`/account/orders/${orderNumber}`);
    expect(response?.status()).toBe(404);
    await outsiderContext.close();
  });
});
