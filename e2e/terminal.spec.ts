import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('terminal: sayfa açılır, hedef seçici görünür', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Terminal' }).click();
  await page.waitForURL('**/terminal');
  await expect(page.locator('h2').filter({ hasText: 'Terminal' })).toBeVisible({ timeout: 10_000 });
  // xterm canvas/textarea mount oldu mu (node-pty CI'da derliyse session açılır; açılmasa da sayfa+seçici görünür)
  // .page içindeki target select (nav dil seçici ile çakışmayı önlemek için .page kapsamında)
  await expect(page.locator('.page select')).toBeVisible();
  // 360px mobil taşma yok
  await page.setViewportSize({ width: 360, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBeTruthy();
});
