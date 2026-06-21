import { test, expect } from '@playwright/test';
import { login } from './helpers';

const DOMAIN = 'e2e-test.local';
const SSL_DOMAIN = 'ssl-e2e.local';

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
    // Header ve boş-liste action butonu ikisi de aynı adı taşıyabilir; ilkini kullan.
    await page.getByRole('button', { name: '+ Domain Ekle' }).first().click();
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

  test('SSL durumu: yeni domain pending başlar, recheck sonrası error gösterir ve polling sonrası korunur', async ({ page }) => {
    await page.getByRole('link', { name: 'Domainler' }).click();
    await page.waitForURL('**/domains');

    // confirm() diyaloğunu önceden kabul et (silme için).
    page.on('dialog', (d) => d.accept());

    // Yeni proxy domain ekle.
    await page.getByRole('button', { name: '+ Domain Ekle' }).first().click();
    await expect(page.getByText('Domain Ekle', { exact: true })).toBeVisible();

    await page.getByPlaceholder('ornek.com').fill(SSL_DOMAIN);
    await page.getByPlaceholder('3000').fill('3091');

    await page.getByRole('button', { name: 'Ekle', exact: true }).click();

    // Domain listede görünür.
    await expect(page.getByText(SSL_DOMAIN, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Bu domain'in bulunduğu satırı bul.
    const domainRow = page.locator('.domain-card').filter({ hasText: SSL_DOMAIN });

    // Yeni eklenen domain sslStatus: 'pending' → "SSL Bekleniyor" badge'i ve
    // "SSL'i yeniden kontrol et" butonu görünür olmalı.
    await expect(domainRow.getByText('SSL Bekleniyor', { exact: true })).toBeVisible({ timeout: 10_000 });
    const recheckBtn = domainRow.getByLabel("SSL'i yeniden kontrol et");
    await expect(recheckBtn).toBeVisible();

    // Recheck butonuna tıkla. Gerçek TLS bağlantısı 127.0.0.1:443'e yapılır;
    // test ortamında geçerli sertifika yok → status:'error' döner.
    await recheckBtn.click();

    // Hata durumu: "SSL Hatası" badge'i görünür olmalı.
    await expect(domainRow.getByText('SSL Hatası', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Hata durumunda da recheck butonu görünür kalır.
    await expect(domainRow.getByLabel("SSL'i yeniden kontrol et")).toBeVisible();

    // Polling clobber testi: bir poll aralığı (~8s) bekle ve "SSL Hatası" badge'inin
    // hâlâ görünür olduğunu doğrula — load() artık client-side 'error' durumunu koruyor.
    await page.waitForTimeout(9000);
    await expect(domainRow.getByText('SSL Hatası', { exact: true })).toBeVisible();

    // Temizlik: domain'i sil.
    await domainRow.getByTitle('Sil', { exact: true }).click();
    await expect(page.getByText(SSL_DOMAIN, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
