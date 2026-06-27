import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

// Test A: nav link → URL → h2 visible → setup card visible (no CF token in CI)
// NOTE: CI has no Cloudflare token configured; /api/dns/token returns { configured: false }
// so the page renders the token-setup card. We assert the password input is visible —
// robust and locale-independent.
test('dns: nav linke tıkla, başlık ve token-setup kartı görünür', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'DNS' }).click();
  await page.waitForURL('**/dns');

  // Page heading
  await expect(
    page.locator('h2').filter({ hasText: 'DNS' }),
  ).toBeVisible({ timeout: 10_000 });

  // Token-setup card: password input visible (no CF token configured in CI)
  await expect(
    page.locator('input[type="password"]'),
  ).toBeVisible({ timeout: 10_000 });
});

// Test B (SSR): direct navigation → h2 visible → 360px no horizontal overflow
test('dns: doğrudan gezinme çökmüyor, 360px yatay taşmıyor', async ({ page }) => {
  await login(page);
  await page.goto('/dns');

  // h2 must be visible after direct navigation (SSR must not crash)
  await expect(
    page.locator('h2').filter({ hasText: 'DNS' }),
  ).toBeVisible({ timeout: 10_000 });

  // Switch to 360px mobile viewport and check no horizontal overflow
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});
