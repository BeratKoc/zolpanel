import { test, expect } from '@playwright/test';
import { login } from './helpers';

const DOMAIN = 'extras-test.local';

test('caddy advanced: header eklenip kaydedilir ve düzenlemede görünür', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Domainler' }).click();
  await page.waitForURL('**/domains');

  // confirm() diyaloğunu önceden kabul et (silme için).
  page.on('dialog', (d) => d.accept());

  // Sayfa yüklenmesini bekle (spinner'ın gitmesini bekle).
  await expect(page.getByRole('heading', { name: 'Domainler' })).toBeVisible();

  // Önceki çalıştırmadan kalan domain varsa önce sil (idempotent başlangıç).
  // Birden fazla olabilir; hepsini sil.
  while (await page.getByText(DOMAIN, { exact: true }).isVisible()) {
    await page.getByTitle('Sil', { exact: true }).first().click();
    await expect(page.getByText(DOMAIN, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  }

  // + Domain Ekle modalını aç.
  await page.getByRole('button', { name: '+ Domain Ekle' }).first().click();
  await expect(page.getByText('Domain Ekle', { exact: true })).toBeVisible();

  // Domain adı + port doldur (proxy tipi varsayılan).
  await page.getByPlaceholder('ornek.com').fill(DOMAIN);
  await page.getByPlaceholder('3000').fill('3090');

  // Caddy advanced / Headers: "+ Header ekle" butonuna tıkla.
  await page.getByText('+ Header ekle').click();

  // Yeni eklenen satırdaki ilk input: header adı (aria-label="Header adı").
  await page.getByLabel('Header adı').last().fill('X-Test');

  // Yeni eklenen satırdaki ikinci input: header değeri (aria-label="Değer").
  await page.getByLabel('Değer').last().fill('hello');

  // Modal içindeki "Ekle" submit butonuna tıkla ve modalın kapanmasını bekle.
  // "İptal" butonu sadece modal içinde var; kapanınca count=0 olur.
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'İptal' })).toHaveCount(0, { timeout: 10_000 });

  // Liste içinde domain görünür.
  await expect(page.getByText(DOMAIN, { exact: true })).toBeVisible({ timeout: 10_000 });

  // Düzenle modalını aç (title="Düzenle").
  await page.getByTitle('Düzenle').click();

  // Header değerleri edit modalında görünür olmalı.
  // CaddyExtrasEditor inputs have aria-label; use .last() to target the header row.
  await expect(page.getByLabel('Header adı').last()).toHaveValue('X-Test', { timeout: 5_000 });
  await expect(page.getByLabel('Değer').last()).toHaveValue('hello', { timeout: 5_000 });

  // Modalı kapat.
  await page.getByRole('button', { name: 'İptal' }).click();
  await expect(page.getByRole('button', { name: 'İptal' })).toHaveCount(0, { timeout: 5_000 });

  // Temizlik: domain'i sil (idempotent çalışma için).
  await page.getByTitle('Sil', { exact: true }).click();
  await expect(page.getByText(DOMAIN, { exact: true })).toHaveCount(0, { timeout: 10_000 });
});
