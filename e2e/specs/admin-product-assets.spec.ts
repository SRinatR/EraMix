import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PNG = path.join(__dirname, 'fixtures', 'pixel.png');

/**
 * Product image/document attachments (Phase 6). Requires
 * packages/infrastructure/prisma/seed-e2e.ts's PUBLISHED "E2E Fixture
 * Product" (SKU E2E-0001, publicId E2E00001). Tests assume a freshly seeded
 * database — re-run `db:seed:e2e` (it upserts, so it's safe to repeat)
 * before re-running this file if a prior run left extra assets behind; the
 * asserts below use relative counts/first-row scoping specifically so
 * leftover state doesn't make them flaky, but a clean slate is still the
 * intended baseline.
 */
test.describe('admin product media/documents', () => {
  test('upload, publish gate (alt text required for images), and public visibility', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/catalog');
    await page.getByRole('link', { name: 'Manage media' }).first().click();
    await expect(page.getByRole('heading', { name: /^Media/ })).toBeVisible();

    await page.setInputFiles('input[type="file"]', FIXTURE_PNG);
    await page.getByRole('button', { name: 'Upload' }).click();

    const row = page.locator('tbody tr').first();
    await expect(row.getByText('DRAFT')).toBeVisible();

    const statusSelect = row.locator('select');
    const metadataSaveButton = row.locator('form').nth(0).getByRole('button', { name: 'Save' });
    const statusSaveButton = row.locator('form').nth(1).getByRole('button', { name: 'Save' });

    // Publishing without alt text is rejected (accessibility gate).
    await statusSelect.selectOption('PUBLISHED');
    await statusSaveButton.click();
    await expect(page.getByRole('alert')).toContainText(/alt text/i);

    // Fill alt text via the metadata form, then publish again.
    await row.getByLabel('Alt text').fill('A single transparent pixel, uploaded by the E2E suite');
    await metadataSaveButton.click();
    await statusSelect.selectOption('PUBLISHED');
    await statusSaveButton.click();
    await expect(row.getByText('PUBLISHED')).toBeVisible();

    // A second, unauthenticated context can now see it on the public page.
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto('/en/catalog/E2E00001-e2e-fixture-product');
    await expect(
      publicPage.locator('img[alt="A single transparent pixel, uploaded by the E2E suite"]'),
    ).toBeVisible();
    await publicContext.close();
  });

  test('removing an asset requires confirming a native dialog', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/catalog');
    await page.getByRole('link', { name: 'Manage media' }).first().click();
    await page.setInputFiles('input[type="file"]', FIXTURE_PNG);
    await page.getByRole('button', { name: 'Upload' }).click();

    const removeButtons = page.getByRole('button', { name: 'Remove' });
    const countBefore = await removeButtons.count();

    page.once('dialog', (dialog) => dialog.dismiss());
    await removeButtons.first().click();
    await expect(removeButtons).toHaveCount(countBefore); // dismissed: nothing removed

    page.once('dialog', (dialog) => dialog.accept());
    await removeButtons.first().click();
    await expect(removeButtons).toHaveCount(countBefore - 1);
  });
});
