import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

test.use({ viewport: { width: 393, height: 851 } });

test('mobil: hamburger görünür, sidebar drawer olarak açılır/kapanır', async ({ page }) => {
  await login(page);
  const burger = page.getByRole('button', { name: '☰' });
  await expect(burger).toBeVisible();
  await burger.click();
  await expect(page.getByRole('link', { name: /Domainler|Domains/ })).toBeVisible();
  await page.locator('.sidebar-backdrop').click();
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
});

test('mobil: dashboard yatay taşma yok', async ({ page }) => {
  await login(page);
  await expectNoOverflow(page);
});
