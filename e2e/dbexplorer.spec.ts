import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('dbexplorer: veritabanları sayfası, bağlantı varsa editör + SQL konsolu çalışır', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Veritabanları' }).click();
  await page.waitForURL('**/databases');

  // Sayfa başlığı — h2 ile kapsama alarak nav linkiyle karışmayı önle.
  await expect(page.locator('h2').filter({ hasText: 'Veritabanları' })).toBeVisible({ timeout: 10_000 });

  // Bağlantı kartı veya boş durum bekleniyor.
  const emptyState = page.getByText('Veritabanı yok', { exact: true });
  // DB Explorer bağlantı kartı: .domain-card + "Aç" butonu olan herhangi bir kart
  const openBtn = page.getByRole('button', { name: 'Aç' }).first();

  // Her iki durumu da kabul et — CI'da DB konteyneri olmayabilir.
  await expect(emptyState.or(openBtn)).toBeVisible({ timeout: 15_000 });

  // Bağlantı kartı yoksa → boş durum; testi geçir.
  const hasConnection = await openBtn.isVisible().catch(() => false);
  if (!hasConnection) {
    // Boş durum: test bu dalda geçer.
    return;
  }

  // Editörü aç
  await openBtn.click();
  await page.waitForURL('**/databases/**', { timeout: 10_000 });

  // Editör başlığını doğrula — h2 ile kapsa (nav ile karışmasın).
  await expect(
    page.locator('h2').filter({ hasText: 'DB Düzenleyici' }),
  ).toBeVisible({ timeout: 10_000 });

  // Sol ağaçta en az bir DB düğümü görünmeli (DbTree yüklenmiş olmalı).
  // Ağaç, veritabanı adlarını buton olarak gösteriyor; herhangi bir şeyin görünmesini bekle.
  // Timeout yüksek tutuyoruz — bağlantı kurulumu zaman alabilir.
  await page.waitForTimeout(1500);

  // SQL sekmesine geç — "SQL Konsolu" yazısına tıkla (tab bar içinde).
  // Tab bar butonları, nav select'lerinden farklı olarak role=button değil; type=button.
  const sqlTab = page.getByRole('button', { name: 'SQL Konsolu' }).first();
  await expect(sqlTab).toBeVisible({ timeout: 8_000 });
  await sqlTab.click();

  // Textarea görünmeli — SQL Konsolu aria-label ile kapsanmış.
  const textarea = page.getByRole('textbox', { name: 'SQL Konsolu' });
  await expect(textarea).toBeVisible({ timeout: 5_000 });

  // SELECT 1 yaz
  await textarea.fill('SELECT 1');

  // Çalıştır butonuna tıkla — içerik alanı içindeki "Çalıştır" butonunu hedefle.
  // Nav/toolbar'daki olası başka elemanlarla karışmayı önlemek için first() kullan.
  const runBtn = page.getByRole('button', { name: 'Çalıştır' }).first();
  await expect(runBtn).toBeEnabled({ timeout: 5_000 });
  await runBtn.click();

  // Sonuç tablosunda "1" değeri içeren bir hücre bekleniyor.
  // Generous timeout — DB bağlantısı ilk kurulumda yavaş olabilir.
  await expect(
    page.locator('td').filter({ hasText: /^1$/ }).first(),
  ).toBeVisible({ timeout: 20_000 });
});
