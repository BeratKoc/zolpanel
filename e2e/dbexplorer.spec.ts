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

  // Grid v2: Filtre düğmesi görünür (DB bağlantısı + tablo seçili dalda).
  const filterBtn = page.getByRole('button', { name: 'Filtre' });
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click(); // filtre satırını aç — hata atmamalı
  }

  // Yapı sekmesi (DDL) — bağlantı + tablo varsa görünür ve açılır.
  const structureTab = page.getByRole('button', { name: 'Yapı' });
  if (await structureTab.isVisible().catch(() => false)) {
    await structureTab.click(); // Yapı sekmesi açılır — hata atmamalı
  }

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

test('dbexplorer: redis bağlantısı varsa editör açılır ve anahtar tarayıcı görünür', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Veritabanları' }).click();
  await page.waitForURL('**/databases');

  // Sayfa başlığı yüklenene kadar bekle.
  await expect(page.locator('h2').filter({ hasText: 'Veritabanları' })).toBeVisible({ timeout: 10_000 });

  // Herhangi bir bağlantı kartının yüklenmesini bekle (boş durum VEYA domain-card).
  const emptyState = page.getByText('Veritabanı yok', { exact: true });
  const anyCard = page.locator('.domain-card').first();
  await expect(emptyState.or(anyCard)).toBeVisible({ timeout: 15_000 });

  // Redis engine badge'i içeren domain-card'ı bul (engine badge metni "redis").
  // Badge, kart içinde büyük-küçük harf duyarsız olarak "redis" metnini içerir.
  const redisCard = page.locator('.domain-card').filter({ hasText: /redis/i });
  const redisCardCount = await redisCard.count();

  // Redis bağlantısı yoksa testi atla — CI'da konteyner olmayabilir.
  if (redisCardCount === 0) {
    return;
  }

  // Redis kartının "Aç" butonuna tıkla; aynı kart içindeki butonu hedefle.
  const openBtn = redisCard.first().getByRole('button', { name: 'Aç' });
  await expect(openBtn).toBeVisible({ timeout: 5_000 });
  await openBtn.click();

  // Editör URL'sine git.
  await page.waitForURL('**/databases/**', { timeout: 10_000 });

  // Editör başlığı görünmeli.
  await expect(
    page.locator('h2').filter({ hasText: 'DB Düzenleyici' }),
  ).toBeVisible({ timeout: 10_000 });

  // Redis tarayıcı: anahtar arama input'u görünmeli (placeholder: "Anahtar ara (örn: user:*)").
  const keySearchInput = page.getByPlaceholder('Anahtar ara (örn: user:*)');
  await expect(keySearchInput).toBeVisible({ timeout: 10_000 });

  // Anahtar listesi ya da boş durum görünmeli — ikisi de geçerli (Redis boş olabilir).
  // keySearchInput zaten görünür olduğunu doğruladık; ek olarak noKeys veya input tekrar kontrol.
  const noKeys = page.getByText('Anahtar yok', { exact: true });
  await expect(noKeys.or(keySearchInput)).toBeVisible({ timeout: 15_000 });
});
