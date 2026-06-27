import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Test A: nav link → backups page → S3 section visible + config inputs visible (no S3 config in CI)
test('s3: backups sayfasına git, S3 bölümü görünür, yapılandırma girişleri görünür', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Yedekler' }).click();
  await page.waitForURL('**/backups');

  // S3 section heading (h3) — scope to h3 to avoid nav link collision
  await expect(page.locator('h3').filter({ hasText: 'S3' }).first()).toBeVisible({ timeout: 10_000 });

  // CI has no S3 config → configure card with input fields must be visible
  // The secretAccessKey field is type="password" — unique on this page
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 });
});

// Test B: direct SSR nav + 360px no horizontal overflow
test('s3: direct /backups nav → sayfa başlığı görünür, 360px taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/backups');

  // Page heading (h2 Yedekler) — local backups section heading
  await expect(page.locator('h2').filter({ hasText: 'Yedekler' }).first()).toBeVisible({ timeout: 10_000 });

  // Check 360px no horizontal overflow
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'yatay taşma olmamalı').toBeLessThanOrEqual(1);
});
