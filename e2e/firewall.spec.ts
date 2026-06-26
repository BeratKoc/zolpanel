import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

// Test A: nav link → URL → page chrome visible (no crash)
// NOTE: on CI (and Windows dev) ufw may be absent → /api/firewall returns 500;
// the test asserts page chrome only (h2 + "Kural ekle" button), not rule data.
test('firewall: nav linke tıkla, başlık ve kural ekle butonu görünür', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Güvenlik Duvarı' }).click();
  await page.waitForURL('**/firewall');

  // Page heading
  await expect(
    page.locator('h2').filter({ hasText: 'Güvenlik Duvarı' }),
  ).toBeVisible({ timeout: 10_000 });

  // "Kural ekle" (add rule) button — present regardless of ufw status
  await expect(
    page.getByRole('button', { name: 'Kural ekle' }),
  ).toBeVisible({ timeout: 10_000 });
});

// Test B (SSR): direct navigation → h2 visible → 360px no horizontal overflow
test('firewall: doğrudan gezinme çökmüyor, 360px yatay taşmıyor', async ({ page }) => {
  await login(page);
  await page.goto('/firewall');

  // h2 must be visible after direct navigation (SSR must not crash)
  await expect(
    page.locator('h2').filter({ hasText: 'Güvenlik Duvarı' }),
  ).toBeVisible({ timeout: 10_000 });

  // Switch to 360px mobile viewport and check no horizontal overflow
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});
