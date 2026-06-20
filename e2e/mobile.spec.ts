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

test('mobil: processes yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/processes');
  await expectNoOverflow(page);
});

test('mobil: processes gerçek satırlarla kart olarak render + taşma yok', async ({ page }) => {
  await page.route('**/api/processes', async (route) => {
    await route.fulfill({
      json: {
        available: true,
        processes: [
          { id: 0, name: 'uzun-servis-adi-ornegi', status: 'online', pid: 111, cpu: 12, memory: 134217728, restarts: 2, uptime: Date.now() - 7200000, script: '/opt/app/index.js', cwd: '/opt/app' },
          { id: 1, name: 'ikinci-servis', status: 'stopped', pid: 0, cpu: 0, memory: 0, restarts: 5, uptime: 0, script: '/opt/b/server.js', cwd: '/opt/b' },
        ],
      },
    });
  });
  await login(page);
  await page.goto('/processes');
  await expect(page.locator('.proc-row').first()).toBeVisible();
  await expectNoOverflow(page);
});
