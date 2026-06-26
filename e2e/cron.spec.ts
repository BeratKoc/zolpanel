import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

// Test A: nav link → page loads, heading + add button visible (empty state OK)
test('cron: nav link gider, başlık görünür, ekle butonu var, çökmez', async ({ page }) => {
  await login(page);

  // Sidebar nav linkine tıkla
  await page.getByRole('link', { name: 'Zamanlanmış Görevler' }).click();
  await page.waitForURL('**/cron');

  // h2 başlık görünür
  await expect(
    page.locator('h2').filter({ hasText: 'Zamanlanmış Görevler' }),
  ).toBeVisible({ timeout: 10_000 });

  // "Ekle" butonu görünür (crontab boş olsa bile header her zaman render edilir)
  await expect(
    page.getByRole('button', { name: 'Ekle' }),
  ).toBeVisible({ timeout: 10_000 });
});

// Test B: SSR / direct navigation + 360px overflow check
test('cron: doğrudan goto, h2 görünür, 360px yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/cron');

  // h2 başlık görünür
  await expect(
    page.locator('h2').filter({ hasText: 'Zamanlanmış Görevler' }),
  ).toBeVisible({ timeout: 10_000 });

  // 360px mobile viewport → yatay overflow yok
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});
