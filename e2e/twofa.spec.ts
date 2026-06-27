import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

// Test A (REGRESSION — most important): normal login (no 2FA) still works after 2FA feature landed.
// If this fails it means 2FA opt-in broke normal login flow — STOP immediately.
test('2FA: normal giriş (2FA olmadan) hâlâ çalışıyor — dashboard erişimi', async ({ page }) => {
  await login(page);
  // login() already asserts dashboard URL + Domainler link; add a belt-and-suspenders check.
  await expect(page.getByRole('link', { name: 'Domainler' })).toBeVisible();
});

// Test B: settings page shows both the 2FA section and the API Tokens section.
test('2FA: Ayarlar sayfasında 2FA bölümü ve API Token bölümü görünür', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.waitForURL('**/settings', { timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // 2FA section: the section heading "İki Adımlı Doğrulama (2FA)" is rendered as
  // an uppercase <p> label via the Section component; OR the enable button when
  // 2FA is disabled (which is the initial state in e2e test DB).
  // Use .first() to guard against strict-mode errors if text appears more than once.
  const twofaSection = page
    .getByText('İki Adımlı Doğrulama (2FA)', { exact: false })
    .first();
  await expect(twofaSection).toBeVisible({ timeout: 10_000 });

  // "Etkinleştir" button is shown when 2FA is disabled (fresh test DB).
  const enableBtn = page.getByRole('button', { name: 'Etkinleştir' }).first();
  await expect(enableBtn).toBeVisible({ timeout: 10_000 });

  // API Tokens section heading
  const tokensSection = page
    .getByText("API Token'ları", { exact: false })
    .first();
  await expect(tokensSection).toBeVisible({ timeout: 10_000 });

  // "Oluştur" button inside the API Tokens create form
  const createBtn = page.getByRole('button', { name: 'Oluştur' }).first();
  await expect(createBtn).toBeVisible({ timeout: 10_000 });
});

// Test C (SSR + mobile): direct goto('/settings') must not crash; 360px no horizontal overflow.
test('2FA: Ayarlar doğrudan goto — başlık görünür, 360px yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // Settings heading (h2) must render — proves no SSR/client crash.
  await expect(page.locator('h2').filter({ hasText: 'Ayarlar' })).toBeVisible({ timeout: 10_000 });

  // Switch to 360 px and verify no horizontal overflow.
  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoOverflow(page);
});
