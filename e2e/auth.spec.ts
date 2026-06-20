import { test, expect } from '@playwright/test';
import { ADMIN_USER, ADMIN_PASS } from './helpers';

test.describe('auth', () => {
  test('login sayfası görünür ve boş submit inline hata verir', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Zolpanel' })).toBeVisible();
    await expect(page.getByPlaceholder('Kullanıcı adı')).toBeVisible();
    await expect(page.getByPlaceholder('Şifre')).toBeVisible();

    // Boş submit → inline hata (form fetch yapmadan döner).
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page.getByText('Kullanıcı adı ve şifre girin')).toBeVisible();
  });

  test('yanlış şifre 401 döner ve giriş yapılmaz', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Kullanıcı adı').fill(ADMIN_USER);
    await page.getByPlaceholder('Şifre').fill('wrong-password');
    // Login endpoint'i geçersiz kimlik için 401 döner. api-client 401'i oturum
    // sonu sayıp /login'e geri yönlendirir; dolayısıyla kullanıcı dashboard'a
    // GİREMEZ ve login formunda kalır.
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.getByRole('button', { name: 'Giriş Yap' }).click(),
    ]);
    expect(resp.status()).toBe(401);
    // Korumalı alana geçilmediğini doğrula: hâlâ login formundayız.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByPlaceholder('Kullanıcı adı')).toBeVisible();
  });

  test('doğru bilgilerle giriş dashboard a yönlendirir', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Kullanıcı adı').fill(ADMIN_USER);
    await page.getByPlaceholder('Şifre').fill(ADMIN_PASS);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    // Sidebar nav görünür.
    await expect(page.getByRole('link', { name: 'Domainler' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ayarlar' })).toBeVisible();
  });

  test('giriş yapılmadan korunan sayfa login e yönlendirir', async ({ page }) => {
    // Temiz context: token yok. AuthGate /login'e atmalı.
    await page.goto('/domains');
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page.getByPlaceholder('Kullanıcı adı')).toBeVisible();
  });
});
