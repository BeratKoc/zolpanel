import { Page, expect } from '@playwright/test';

export const ADMIN_USER = 'admin';
export const ADMIN_PASS = 'TestPass123!';

// UI üzerinden gerçek login yapar; dashboard'a yönlendirilene kadar bekler.
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('Kullanıcı adı').fill(ADMIN_USER);
  await page.getByPlaceholder('Şifre').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  // Login sonrası "/" → "/dashboard" yönlendirmesi + AuthGate verify.
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Domainler' })).toBeVisible();
}
