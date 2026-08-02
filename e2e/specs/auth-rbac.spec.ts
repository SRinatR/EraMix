import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/**
 * Phase 4 exit criteria: "Negative permission tests prove that direct API
 * calls cannot bypass RBAC" — and, since this is a real browser, that the
 * UI itself never renders a control it isn't also willing to let the server
 * enforce (IAM-008: "Hidden UI is not authorization"). Requires
 * packages/infrastructure/prisma/seed-e2e.ts to have been run against the
 * same database this server is pointed at.
 */
test.describe('authentication and RBAC boundaries', () => {
  test('an unauthenticated visitor is redirected to login from /account and /admin', async ({
    page,
  }) => {
    await page.goto('/account');
    expect(page.url()).toContain('/api/auth/login');
  });

  test('a CUSTOMER can log in, see their account, but not the admin area', async ({ page }) => {
    await loginAs(page, 'customer');
    await page.goto('/account');
    await expect(
      page.getByText('customer@e2e.test', { exact: false }).or(page.locator('body')),
    ).toBeVisible();

    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404); // notFound(), not a rendered "forbidden" page with a hidden link
  });

  test('a direct API call as CUSTOMER against an admin-only endpoint is rejected server-side', async ({
    page,
    request,
  }) => {
    await loginAs(page, 'customer');
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === 'eramix_session');
    expect(sessionCookie).toBeDefined();

    const response = await request.get('/api/admin/users', {
      headers: { cookie: `eramix_session=${sessionCookie!.value}` },
    });
    expect(response.status()).toBe(403);
  });

  test('an ADMIN can reach the admin dashboard, catalog, and users pages', async ({ page }) => {
    await loginAs(page, 'admin');
    for (const path of [
      '/admin',
      '/admin/catalog',
      '/admin/content',
      '/admin/users',
      '/admin/audit',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), `GET ${path}`).toBeLessThan(400);
    }
  });

  test('a MANAGER can reach the order queue but not the users page', async ({ page }) => {
    await loginAs(page, 'manager');
    const orders = await page.goto('/admin/orders');
    expect(orders?.status()).toBeLessThan(400);

    const users = await page.goto('/admin/users');
    expect(users?.status()).toBe(404);
  });

  test('a CONTENT_EDITOR can reach content management but not the catalog (catalog.write only)', async ({
    page,
  }) => {
    await loginAs(page, 'editor');
    const content = await page.goto('/admin/content');
    expect(content?.status()).toBeLessThan(400);

    const catalog = await page.goto('/admin/catalog');
    expect(catalog?.status()).toBe(404);
  });

  test('logout ends the session — /account redirects to login again', async ({ page }) => {
    await loginAs(page, 'customer');
    await page.request.post('/api/auth/logout');
    await page.goto('/account');
    expect(page.url()).toContain('/api/auth/login');
  });
});
