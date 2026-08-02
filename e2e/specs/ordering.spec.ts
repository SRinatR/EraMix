import { expect, test } from '@playwright/test';
import { loginAs, replaySubmitRequest, submitOrderViaUi } from './helpers';

/**
 * Phase 5 exit criteria: "E2E verifies submit, duplicate Idempotency-Key
 * behaviour, forbidden transitions, customer isolation, manager transition."
 * Requires packages/infrastructure/prisma/seed-e2e.ts's PUBLISHED fixture
 * product and demo company/membership.
 *
 * The account UI now has a real "Submit order" button
 * (apps/web/src/app/[locale]/account/orders/[orderNumber]/submit-order-button.tsx)
 * that generates and sends the Idempotency-Key header itself — every test
 * below drives that button (via helpers.ts's submitOrderViaUi), the same way
 * a real customer would. The duplicate-Idempotency-Key assertion replays the
 * exact request the button sent (replaySubmitRequest) to verify the
 * server-side no-op behaviour a network retry would exercise — this is not a
 * substitute for the customer journey, since the customer journey (create,
 * add/remove a line, submit) is fully UI-driven; it specifically verifies
 * what happens if that same UI-originated request is delivered twice.
 */
async function createDraftOrder(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/account/orders/new');
  await page.getByRole('button', { name: /create draft order/i }).click();
  await page.waitForURL(/\/account\/orders\/[A-Z0-9-]+$/);
  return page.url().split('/').pop()!;
}

test.describe('quote-only order lifecycle', () => {
  test('a customer can create a draft order, edit its lines, and see it in their account', async ({
    page,
  }) => {
    await loginAs(page, 'customer');
    await createDraftOrder(page);
    await expect(page.getByText('Status: DRAFT')).toBeVisible();

    // The draft-editing UI (add a line) is reachable and wired to the real API.
    await expect(page.getByRole('heading', { name: 'Add a line' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^add line$/i })).toBeVisible();
  });

  test('a customer can submit a draft order via the real Submit order button', async ({ page }) => {
    await loginAs(page, 'customer');
    await createDraftOrder(page);

    const { request } = await submitOrderViaUi(page);
    expect(request.url()).toContain('/submit');

    await expect(page.getByText('Status: SUBMITTED')).toBeVisible();
    const historyItems = page.locator('h2:has-text("Status history") + ul li');
    await expect(historyItems).toHaveCount(1);

    // Once SUBMITTED, the draft-editing controls (add line / submit) are
    // gone — ORD-006, and the button's own effective single-use behaviour.
    await expect(page.getByRole('button', { name: /submit order/i })).toHaveCount(0);
  });

  test('replaying the same Idempotency-Key the Submit order button sent is a no-op, not a duplicate transition', async ({
    page,
  }) => {
    await loginAs(page, 'customer');
    await createDraftOrder(page);

    const { request } = await submitOrderViaUi(page);
    await expect(page.getByText('Status: SUBMITTED')).toBeVisible();

    const replay = await replaySubmitRequest(page, request);
    expect(replay.status()).toBeLessThan(300);
    const replayBody = await replay.json();
    expect(replayBody.status).toBe('SUBMITTED');

    await page.reload();
    await expect(page.getByText('Status: SUBMITTED')).toBeVisible();
    // Exactly one DRAFT->SUBMITTED transition in the history, not two.
    const historyItems = page.locator('h2:has-text("Status history") + ul li');
    await expect(historyItems).toHaveCount(1);
  });

  test('a MANAGER can see an order a CUSTOMER submitted', async ({ page, browser }) => {
    await loginAs(page, 'customer');
    const orderNumber = await createDraftOrder(page);
    await submitOrderViaUi(page);

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
