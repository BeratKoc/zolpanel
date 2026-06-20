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
