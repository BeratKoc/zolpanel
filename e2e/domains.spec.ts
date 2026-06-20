import { test, expect } from '@playwright/test';
import { login } from './helpers';

const DOMAIN = 'e2e-test.local';

test.describe('domains', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('proxy domain ekle, durumunu değiştir ve sil', async ({ page }) => {
    await page.getByRole('link', { name: 'Domainler' }).click();
    await page.waitForURL('**/domains');

    // confirm() diyaloğunu önceden kabul et (silme için).
    page.on('dialog', (d) => d.accept());

    // + Domain Ekle modalını aç. (Modal başlığı <span>, role=heading değil.)
    await page.getByRole('button', { name: '+ Domain Ekle' }).click();
    await expect(page.getByText('Domain Ekle', { exact: true })).toBeVisible();

    // Proxy tipi varsayılan; domain adı + port doldur.
    await page.getByPlaceholder('ornek.com').fill(DOMAIN);
    await page.getByPlaceholder('3000').fill('3070');

    // Modal içindeki "Ekle" submit butonu.
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();

    // Liste içinde domain görünür.
    await expect(page.getByText(DOMAIN, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Toggle/edit/delete butonlarının erişilebilir adı emoji (⏸/▶/🗑); bu yüzden
    // title attribute'u ile seçiyoruz. Aktif → title="Durdur"; offline → "Aktif Et".
    await page.getByTitle('Durdur').click();
    await expect(page.getByTitle('Aktif Et')).toBeVisible({ timeout: 10_000 });
    await page.getByTitle('Aktif Et').click();
    await expect(page.getByTitle('Durdur')).toBeVisible({ timeout: 10_000 });

    // Sil (title="Sil"). confirm zaten kabul ediliyor.
    await page.getByTitle('Sil', { exact: true }).click();
    await expect(page.getByText(DOMAIN, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
