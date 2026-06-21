import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('docker: sayfaya git, başlık görünür, boş durum ya da en az bir konteyner satırı gösterilir', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Docker' }).click();
  await page.waitForURL('**/docker');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Docker' })).toBeVisible({ timeout: 10_000 });

  // Docker yoksa boş durum ("Konteyner yok"), varsa en az bir konteyner kartı görünür.
  const emptyState = page.getByText('Konteyner yok', { exact: true });
  const firstRow = page.locator('.domain-card').first();

  await expect(emptyState.or(firstRow)).toBeVisible({ timeout: 10_000 });
});
