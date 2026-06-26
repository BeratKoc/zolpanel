import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('files: nav linkine tıkla, başlık ve kök dizin girişleri görünür', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Dosyalar' }).click();
  await page.waitForURL('**/files');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Dosyalar' })).toBeVisible({ timeout: 10_000 });

  // Kök dizin ('/') altında en az bir giriş görünmeli.
  // Tablo satırları tbody > tr olarak render edilir; loading bitince ortaya çıkar.
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });

  // Tablo en az bir satır içermeli (sunucu türünden bağımsız).
  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount, 'kök dizinde en az 1 giriş olmalı').toBeGreaterThanOrEqual(1);
});

test('files: doğrudan /files gezintisi çökmemeli, 360px yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/files');

  // Sayfa başlığı — doğrudan SSR gezintisinde görünmeli.
  await expect(page.locator('h2').filter({ hasText: 'Dosyalar' })).toBeVisible({ timeout: 10_000 });

  // 360px genişliğinde yatay taşma kontrolü.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForLoadState('networkidle');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'yatay taşma olmamalı (360px)').toBeLessThanOrEqual(1);
});
