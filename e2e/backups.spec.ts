import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('backups: sayfaya git, başlık görünür, yedek oluştur, bir yedek satırı görünür, sil', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Yedekler' }).click();
  await page.waitForURL('**/backups');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Yedekler' })).toBeVisible({ timeout: 10_000 });

  // "Şimdi yedekle" butonuna bas — yedekleme hızlı (küçük DB + Caddyfile).
  await page.getByRole('button', { name: 'Şimdi yedekle' }).click();

  // En az bir yedek satırı görünür (her satırda aria-label="Sil" butonu vardır).
  const firstDeleteBtn = page.getByRole('button', { name: 'Sil' }).first();
  await expect(firstDeleteBtn).toBeVisible({ timeout: 15_000 });

  // Silme işlemi: confirm diyalogunu önceden kabul et, ardından sil butonuna bas.
  const deleteButtons = page.getByRole('button', { name: 'Sil' });
  const countBefore = await deleteButtons.count();

  page.on('dialog', dialog => dialog.accept());
  await firstDeleteBtn.click();

  // Satır sayısı azalmalı ya da boş durum ekrana gelmeli.
  if (countBefore === 1) {
    // Tek yedek vardı; silinince boş durum ("Yedek yok") görünmeli.
    await expect(page.getByText('Yedek yok', { exact: true })).toBeVisible({ timeout: 10_000 });
  } else {
    // Birden fazla yedek vardı; sayı azalmalı.
    await expect(deleteButtons).toHaveCount(countBefore - 1, { timeout: 10_000 });
  }
});
