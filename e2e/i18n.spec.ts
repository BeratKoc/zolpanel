import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('i18n', () => {
  test('dil değiştirici tr <-> en geçişi', async ({ page }) => {
    await login(page);

    // Varsayılan tr: nav Türkçe.
    await expect(page.getByRole('link', { name: 'Domainler' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ayarlar' })).toBeVisible();

    // LanguageSwitcher select'i (aria-label="Dil" in Turkish) → English.
    const switcher = page.getByLabel('Dil');
    await switcher.selectOption('en');

    // Nav İngilizce olmalı.
    await expect(page.getByRole('link', { name: 'Domains' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Geri tr.
    await page.getByLabel('Language').selectOption('tr');
    await expect(page.getByRole('link', { name: 'Domainler' })).toBeVisible({ timeout: 10_000 });
  });
});
