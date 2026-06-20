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

test('mobil: dashboard kart grid taşmıyor (derin)', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
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

test('mobil: domains taşma yok + ekle modal sığar', async ({ page }) => {
  await login(page);
  await page.goto('/domains');
  await expectNoOverflow(page);
  await page.getByText(/Domain Ekle|Add Domain/).first().click();
  await expectNoOverflow(page);
  await page.getByText(/Gelişmiş|Advanced/).first().click();   // advanced → route editor visible
  await expectNoOverflow(page);
});

test('mobil: domain kartı taşmıyor (mock liste)', async ({ page }) => {
  await page.route('**/api/domains', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ json: [
      { _id:'a1', domain:'cok-uzun-ornek-alan-adi.example.com', type:'proxy', port:3070, rootPath:null, routes:null, aliases:['www.cok-uzun-ornek-alan-adi.example.com'], appType:'next.js', notes:'', status:'active', sslStatus:'active', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' },
    ] });
  });
  await login(page);
  await page.goto('/domains');
  await expect(page.locator('.domain-card').first()).toBeVisible();
  await expectNoOverflow(page);
});

test('mobil: logs taşma yok', async ({ page }) => {
  await page.route('**/api/system/logs**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ json: [
      { _id:'l1', domain:'cok-uzun-alan-adi.example.com', level:'info', message:'Çok uzun bir log mesajı '.repeat(8), timestamp:'2026-01-01T12:00:00Z' },
      { _id:'l2', domain:'system', level:'error', message:'Hata: '.repeat(20), timestamp:'2026-01-01T12:01:00Z' },
    ] });
  });
  await login(page);
  await page.goto('/logs');
  await expect(page.locator('.log-row').first()).toBeVisible();
  await expectNoOverflow(page);
});
