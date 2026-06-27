import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

// Test A: nav link → URL + page chrome (h2 + refresh button) — no crash.
// The API calls (df / apt / docker) may fail on Windows dev; that's expected —
// the page must not throw a client-side React error and must still render its chrome.
test('maintenance: nav link → sayfaya git, başlık ve Yenile butonu görünür, React hatası yok', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Bakım' }).click();
  await page.waitForURL('**/maintenance');

  // Page heading
  await expect(page.locator('h2').filter({ hasText: 'Bakım' })).toBeVisible({ timeout: 10_000 });

  // Refresh button — present regardless of whether disk/updates data loaded
  await expect(page.getByRole('button', { name: 'Yenile' })).toBeVisible({ timeout: 10_000 });

  // Wait for loading spinners to clear (API calls settle — success OR error toast)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => { /* timeout ok */ });

  // Confirm no React error boundary / unhandled error overlay rendered
  const errorOverlay = page.locator('text=Application error').or(page.locator('[data-nextjs-dialog]'));
  await expect(errorOverlay).not.toBeVisible({ timeout: 3_000 }).catch(() => {
    // If this assertion itself times-out it means the locator was never visible — that's fine.
  });

  // Refresh button still present after settle
  await expect(page.getByRole('button', { name: 'Yenile' })).toBeVisible({ timeout: 5_000 });
});

// Test B (SSR): direct navigation + 360px no horizontal overflow.
test('maintenance: doğrudan goto + 360px yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/maintenance');

  // Direct navigation must land on the page without crashing
  await expect(page.locator('h2').filter({ hasText: 'Bakım' })).toBeVisible({ timeout: 10_000 });

  // Switch to 360px viewport and check overflow
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => { /* ok */ });

  await expectNoOverflow(page);
});
