import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('apps: sayfaya git, başlık görünür, boş durum ya da en az bir kart gösterilir; oluştur modalı açılır ve kapatılır', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Uygulamalar' }).click();
  await page.waitForURL('**/apps');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Uygulamalar' })).toBeVisible({ timeout: 10_000 });

  // Uygulama yoksa boş durum ("Uygulama yok"), varsa en az bir uygulama kartı görünür.
  const emptyState = page.getByText('Uygulama yok', { exact: true });
  const firstCard = page.locator('.domain-card').first();

  await expect(emptyState.or(firstCard)).toBeVisible({ timeout: 10_000 });

  // Oluştur modalını aç: repoUrl input görünür olmalı.
  await page.getByRole('button', { name: 'Uygulama ekle' }).click();
  const repoInput = page.getByPlaceholder('https://github.com/user/repo');
  await expect(repoInput).toBeVisible({ timeout: 5_000 });

  // Modalı kapat — gerçek uygulama oluşturma yok (build yavaş + konteyner bırakır).
  await page.getByRole('button', { name: 'İptal' }).click();
  await expect(repoInput).not.toBeVisible({ timeout: 5_000 });
});
