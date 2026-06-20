import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

test.use({ viewport: { width: 393, height: 851 } });

test('mobil: hamburger görünür, sidebar drawer olarak açılır/kapanır', async ({ page }) => {
  await login(page);
  const burger = page.getByRole('button', { name: 'menu' });
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

test('mobil: settings taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expectNoOverflow(page);
});

test('mobil: login sayfası 393px taşmıyor', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await expectNoOverflow(page);
});

test('mobil: logs sayfasında hamburger erişilebilir, drawer açılıp nav çalışır', async ({ page }) => {
  await page.route('**/api/system/logs**', r => r.request().method()==='GET'
    ? r.fulfill({ json: Array.from({length:40}, (_,i)=>({ _id:'l'+i, domain:'system', level:'info', message:'log satiri '+i, timestamp:'2026-01-01T00:00:'+String(i%60).padStart(2,'0')+'Z' })) }) : r.continue());
  await login(page);
  await page.goto('/logs');
  await page.waitForLoadState('networkidle');
  // Auto-scroll fires: scroll to bottom of log list
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(400);
  // Hamburger must remain visible (not pushed off-screen by log overflow)
  const burger = page.getByRole('button', { name: /menü|menu|☰/i });
  await expect(burger).toBeVisible();
  // boundingBox.y must be >= 0 (not scrolled out of view)
  const box = await page.locator('.hamburger').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(60); // topbar is 52px tall, burger must be within it
  // The log list scroll container must be the actual scroll host (scrollHeight > clientHeight).
  // min-height:0 on .log-shell and its log-list child ensures the inner div is the scroll
  // container (not main/body), preventing scrollIntoView from scrolling the topbar away on
  // real mobile devices (iOS Safari, Android WebView).
  const logListScrollable = await page.evaluate(() => {
    const logShell = document.querySelector('.log-shell') as HTMLElement;
    if (!logShell) return { ok: false, scrollHeight: 0, clientHeight: 0 };
    // Find the overflowY:auto scroll container inside log-shell
    let logList: HTMLElement | null = null;
    for (let i = 0; i < logShell.children.length; i++) {
      const child = logShell.children[i] as HTMLElement;
      if (getComputedStyle(child).overflowY === 'auto') { logList = child; break; }
    }
    if (!logList) return { ok: false, scrollHeight: 0, clientHeight: 0 };
    return {
      ok: logList.scrollHeight > logList.clientHeight,
      scrollHeight: logList.scrollHeight,
      clientHeight: logList.clientHeight,
    };
  });
  expect(logListScrollable.ok, `log list must be scroll-contained (scrollHeight > clientHeight): got ${JSON.stringify(logListScrollable)}`).toBe(true);
  // Open drawer and navigate back to dashboard
  await burger.click();
  await expect(page.getByRole('link', { name: /Panel|Dashboard/ })).toBeVisible();
  await page.getByRole('link', { name: /Panel|Dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
