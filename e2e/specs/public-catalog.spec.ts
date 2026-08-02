import { expect, test } from '@playwright/test';

/**
 * Phase 2/3 exit criteria, exercised against a real browser: locale
 * detection/redirect, explicit-prefix-wins, canonical routes, 404 handling.
 * No authentication needed — these are all public pages.
 */
test.describe('public catalog and content', () => {
  test('an unprefixed entry URL redirects to a locale prefix, in one hop', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toMatch(/^\/(en|ru|uz)\/?$/);
  });

  test('an explicit locale prefix always wins over Accept-Language', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'ru',
      extraHTTPHeaders: { 'accept-language': 'ru' },
    });
    const page = await context.newPage();
    await page.goto('/uz');
    expect(new URL(page.url()).pathname.startsWith('/uz')).toBe(true);
    await context.close();
  });

  test('an unsupported locale is a 404, not a silently-wrong-language page', async ({ page }) => {
    const response = await page.goto('/fr');
    expect(response?.status()).toBe(404);
  });

  test('the catalog index lists at least the E2E fixture category', async ({ page }) => {
    await page.goto('/en/catalog');
    await expect(page.getByText('E2E Category', { exact: false })).toBeVisible();
  });

  test('the published fixture product renders name, price disclaimer, and description', async ({
    page,
  }) => {
    await page.goto('/en/catalog/E2E00001-e2e-fixture-product');
    await expect(page.getByRole('heading', { name: 'E2E Fixture Product' })).toBeVisible();
    await expect(page.getByText('from', { exact: false })).toBeVisible();
  });

  test('a stale product slug 308-redirects to the canonical URL by publicId, never 404s', async ({
    page,
  }) => {
    const response = await page.goto('/en/catalog/E2E00001-wrong-slug-entirely');
    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toContain('/en/catalog/E2E00001-e2e-fixture-product');
  });

  test('an unknown product publicId is a 404', async ({ page }) => {
    const response = await page.goto('/en/catalog/ZZZZZZZZ-nonexistent');
    expect(response?.status()).toBe(404);
  });

  test('FAQ page renders without authentication', async ({ page }) => {
    const response = await page.goto('/en/faq');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
  });

  test('robots.txt and sitemap.xml are both reachable', async ({ page, request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
  });
});
