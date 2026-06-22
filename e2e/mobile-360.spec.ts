import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

test.use({ viewport: { width: 360, height: 780 } });

const PROCS = { available: true, processes: [
  { id:0, name:'uzun-servis-adi-ornegi', status:'online', pid:111, cpu:12, memory:134217728, restarts:2, uptime: Date.now()-7200000, script:'/opt/app/index.js', cwd:'/opt/app' },
  { id:1, name:'ikinci-servis', status:'stopped', pid:0, cpu:0, memory:0, restarts:5, uptime:0, script:'/opt/b/server.js', cwd:'/opt/b' },
]};
const DOMAINS = [
  { _id:'a1', domain:'cok-uzun-ornek-alan-adi.example.com', type:'proxy', port:3070, rootPath:null, routes:null, aliases:['www.cok-uzun-ornek-alan-adi.example.com'], appType:'next.js', notes:'', status:'active', sslStatus:'active', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' },
];
const LOGS = [
  { _id:'l1', domain:'cok-uzun-alan-adi.example.com', level:'info', message:'Çok uzun bir log mesajı '.repeat(8), timestamp:'2026-01-01T12:00:00Z' },
];

test('360px: tüm sayfalar yatay taşmıyor', async ({ page }) => {
  await page.route('**/api/processes', r => r.request().method()==='GET' ? r.fulfill({ json: PROCS }) : r.continue());
  await page.route('**/api/domains', r => r.request().method()==='GET' ? r.fulfill({ json: DOMAINS }) : r.continue());
  await page.route('**/api/system/logs**', r => r.request().method()==='GET' ? r.fulfill({ json: LOGS }) : r.continue());
  await login(page);
  for (const path of ['/dashboard', '/domains', '/processes', '/logs', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoOverflow(page);
  }
});

test('360px: login taşmıyor', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await expectNoOverflow(page);
});

// Mobil drawer'ı açıp verilen nav linkine tıklar.
async function mobileNav(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('link', { name: label }).click();
}

test('360px: docker sayfası yatay taşmıyor', async ({ page }) => {
  await login(page);
  await mobileNav(page, 'Docker');
  await page.waitForURL('**/docker');
  await expect(page.locator('h2').filter({ hasText: 'Docker' })).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});

test('360px: databases sayfası yatay taşmıyor', async ({ page }) => {
  await login(page);
  await mobileNav(page, 'Veritabanları');
  await page.waitForURL('**/databases');
  await expect(page.locator('h2').filter({ hasText: 'Veritabanları' })).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});

test('360px: apps sayfası yatay taşmıyor', async ({ page }) => {
  await login(page);
  await mobileNav(page, 'Uygulamalar');
  await page.waitForURL('**/apps');
  await expect(page.locator('h2').filter({ hasText: 'Uygulamalar' })).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});

test('360px: backups sayfası yatay taşmıyor', async ({ page }) => {
  await login(page);
  await mobileNav(page, 'Yedekler');
  await page.waitForURL('**/backups');
  await expect(page.locator('h2').filter({ hasText: 'Yedekler' })).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});

test('360px: db editörü yatay taşmıyor (bağlantı varsa)', async ({ page }) => {
  await login(page);
  await mobileNav(page, 'Veritabanları');
  await page.waitForURL('**/databases');
  await expect(page.locator('h2').filter({ hasText: 'Veritabanları' })).toBeVisible({ timeout: 10_000 });

  // Bağlantı kartı veya boş durum bekleniyor.
  const emptyState = page.getByText('Veritabanı yok', { exact: true });
  const anyCard = page.locator('.domain-card').first();

  await expect(emptyState.or(anyCard)).toBeVisible({ timeout: 15_000 });

  // Bağlantı kartı yoksa → boş durum; testi geçir (CI'da DB konteyneri olmayabilir).
  const cardCount = await page.locator('.domain-card').count();
  if (cardCount === 0) {
    return;
  }

  // İlk kartın "Aç" butonuna tıkla ve editörü aç.
  const openBtn = page.locator('.domain-card').first().getByRole('button', { name: 'Aç' });
  await expect(openBtn).toBeVisible({ timeout: 5_000 });
  await openBtn.click();
  await page.waitForURL('**/databases/**', { timeout: 10_000 });

  // Editör başlığı görünmeli.
  await expect(
    page.locator('h2').filter({ hasText: 'DB Düzenleyici' }),
  ).toBeVisible({ timeout: 10_000 });

  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});
