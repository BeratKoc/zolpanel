import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('databases: sayfaya git, başlık görünür, boş durum ya da en az bir kart gösterilir; oluştur modalı açılır ve kapatılır', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Veritabanları' }).click();
  await page.waitForURL('**/databases');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Veritabanları' })).toBeVisible({ timeout: 10_000 });

  // Docker yoksa boş durum ("Veritabanı yok"), varsa en az bir veritabanı kartı görünür.
  const emptyState = page.getByText('Veritabanı yok', { exact: true });
  const firstCard = page.locator('.domain-card').first();

  await expect(emptyState.or(firstCard)).toBeVisible({ timeout: 10_000 });

  // Oluştur modalını aç: modal içindeki engine select görünür olmalı.
  await page.getByRole('button', { name: 'Veritabanı oluştur' }).click();
  const engineSelect = page.locator('form').getByRole('combobox');
  await expect(engineSelect).toBeVisible({ timeout: 5_000 });

  // Modalı kapat — gerçek veritabanı oluşturma yok (imaj indirme yavaş + kalıcı konteyner bırakır).
  await page.getByRole('button', { name: 'İptal' }).click();
  await expect(engineSelect).not.toBeVisible({ timeout: 5_000 });
});
