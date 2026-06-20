# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm paneli (login + 5 panel sayfası + ortak bileşenler) 360px'e kadar yatay taşma olmadan, telefon/tablette okunabilir hale getirmek.

**Architecture:** CSS-first. Responsive layout property'leri inline'dan `app/globals.css`'teki sınıflara taşınır; `@media (max-width:767px)` ve `(max-width:480px)` ile override. Sidebar `<768px`'te hamburger ile açılan off-canvas drawer olur (tek JS state: `useState`). Yoğun tablolar `data-label` + CSS ile karta döner (JS yok). Test: Playwright mobil viewport (393px) — her sayfada yatay-taşma-yok + drawer/kart davranışı.

**Tech Stack:** Next.js 15 (App Router), TypeScript, plain CSS (`globals.css`), Playwright, next-intl.

## Global Constraints

- Hedef: **≥360px** yatay taşma yok. Breakpoint'ler: **768px** (drawer+kart), **480px** (sıkı padding/ikon-only).
- `≥768px` masaüstü görünümü **birebir korunur** (her task sonrası masaüstü E2E koşar).
- **Inline stil media-query'i EZER** → responsive olan property (`display/width/grid-template-columns/flex-direction/değişen padding/gap`) inline'dan SINIFA taşınmalı; kozmetik (renk/font/border) inline kalır.
- Davranış/işlev değişmez; yalnızca düzen. Yeni JS hook YOK (drawer hariç `useState`).
- `noUnusedHorizontalOverflow` ölçütü: `document.documentElement.scrollWidth - clientWidth <= 1`.
- Her commit sonu: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Windows: build EPERM olursa `rm -rf .next` + retry.

---

### Task 1: Responsive temel + mobil shell (drawer) + Playwright mobil harness

**Files:**
- Modify: `app/globals.css` (responsive bölüm ekle)
- Modify: `app/(panel)/layout.tsx` (drawer state + hamburger + backdrop + sınıflar)
- Modify: `playwright.config.ts` (gerekmez — spec içinde `test.use` viewport)
- Create: `e2e/mobile.spec.ts`, `e2e/mobile-helpers.ts`

**Interfaces:**
- Produces: CSS sınıfları `.app-shell .sidebar .sidebar.open .sidebar-backdrop .hamburger .page` (sonraki task'lar `.page`'i kullanır). `mobile-helpers.ts` → `expectNoOverflow(page)`.

- [ ] **Step 1: Mobil test harness + ilk failing test**

`e2e/mobile-helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'yatay taşma olmamalı').toBeLessThanOrEqual(1);
}
```

`e2e/mobile.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { expectNoOverflow } from './mobile-helpers';

test.use({ viewport: { width: 393, height: 851 } });

test('mobil: hamburger görünür, sidebar drawer olarak açılır/kapanır', async ({ page }) => {
  await login(page);                       // /dashboard'a gelir
  const burger = page.getByRole('button', { name: '☰' });
  await expect(burger).toBeVisible();
  // drawer kapalıyken nav linkleri görünmez (off-canvas)
  await burger.click();
  await expect(page.getByRole('link', { name: /Domainler|Domains/ })).toBeVisible();
  // backdrop'a tıkla → kapanır
  await page.locator('.sidebar-backdrop').click();
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
});

test('mobil: dashboard yatay taşma yok', async ({ page }) => {
  await login(page);
  await expectNoOverflow(page);
});
```

- [ ] **Step 2: Testi koş — FAIL**

Run: `npm run build && npx playwright test e2e/mobile.spec.ts`
Expected: FAIL (hamburger yok / sidebar her zaman görünür / taşma var).

- [ ] **Step 3: globals.css'e responsive bölüm ekle**

`app/globals.css` SONUNA ekle:
```css
/* ===================== Responsive ===================== */
.app-shell { display: flex; height: 100vh; overflow: hidden; }
.hamburger { display: none; }
.sidebar-backdrop { display: none; }
.page { padding: 24px; overflow-y: auto; height: 100%; }

@media (max-width: 767px) {
  .sidebar {
    position: fixed; top: 0; left: 0; height: 100%; width: 240px;
    transform: translateX(-100%); transition: transform 0.2s ease;
    z-index: 200;
  }
  .sidebar.open { transform: translateX(0); box-shadow: 0 0 24px rgba(0,0,0,0.5); }
  .sidebar-backdrop {
    display: block; position: fixed; inset: 0; z-index: 150;
    background: rgba(0,0,0,0.5); animation: fadeIn 0.15s ease;
  }
  .hamburger {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; flex-shrink: 0;
    background: transparent; border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text-secondary); font-size: 16px;
  }
  .page { padding: 16px; }
}
@media (max-width: 480px) {
  .page { padding: 12px; }
}
```

- [ ] **Step 4: layout.tsx — drawer mekaniği**

`app/(panel)/layout.tsx`:
- En üstte state: `const [drawerOpen, setDrawerOpen] = useState(false);`
- Kök sarmalayıcı `<div>`'in inline `display:flex,height:100vh,overflow:hidden` stilini KALDIR, yerine `className="app-shell"`.
- `<aside>`'ın inline `width: 'var(--sidebar-width)'` ve `flexShrink:0` KALDIR; `className={"sidebar" + (drawerOpen ? " open" : "")}` ekle; kalan inline (background, borderRight, display, flexDirection) KALIR. Ama base desktop genişliği için `globals.css`'e ekle:
  ```css
  .sidebar { width: var(--sidebar-width); flex-shrink: 0; }
  ```
  (Bu satırı responsive bölümün EN ÜSTÜNE, @media'dan önce ekle.)
- Topbar'ın içine, başlık `<span>`'inden ÖNCE hamburger ekle:
  ```tsx
  <button className="hamburger" aria-label="menu" onClick={() => setDrawerOpen(true)} style={{ marginRight: 12 }}>☰</button>
  ```
- Topbar `<div>`'e `className="topbar"` ekle (ileride lazım; base kural gerekmez).
- Nav `<Link>`'lere tıklanınca drawer kapansın: `NavItem`'a `onNavigate={() => setDrawerOpen(false)}` prop'u geçir; `NavItem` içindeki `<Link>`'e `onClick={onNavigate}` ekle. (NavItem imzasına `onNavigate: () => void` ekle.)
- `</aside>`'dan hemen SONRA (main'den önce) backdrop:
  ```tsx
  {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}
  ```

- [ ] **Step 5: Testi koş — PASS + desktop regresyon**

Run: `npm run build && npx playwright test e2e/mobile.spec.ts e2e/auth.spec.ts`
Expected: mobil shell testleri + masaüstü auth testleri PASS.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css "app/(panel)/layout.tsx" e2e/mobile.spec.ts e2e/mobile-helpers.ts
git commit -m "feat(responsive): mobile shell — hamburger drawer + CSS foundation + mobile e2e harness"
```

---

### Task 2: Processes — yoğun satır → kart (`data-label` + CSS)

**Files:**
- Modify: `components/processes/ProcessRow.tsx`
- Modify: `app/(panel)/processes/page.tsx` (varsa başlık satırına `.proc-header`; root `className="page"`)
- Modify: `app/globals.css` (.proc-row kuralları)
- Modify: `messages/{tr,en,zh,es,de,fr}.json` (yeni kolon etiketleri)
- Modify: `e2e/mobile.spec.ts` (processes assertion)

**Interfaces:**
- Consumes: `.page` (Task 1).
- Produces: i18n anahtarları `processes.colCpu/colMem/colRestarts/colUptime`.

- [ ] **Step 1: Failing test ekle**

`e2e/mobile.spec.ts` sonuna:
```ts
test('mobil: processes yatay taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/processes');
  await expectNoOverflow(page);
});
```
Run: `npm run build && npx playwright test e2e/mobile.spec.ts -g processes`
Expected: FAIL (8-sütun grid taşar).

- [ ] **Step 2: i18n kolon etiketleri ekle**

6 dilde `messages/*.json` `processes` namespace'ine ekle (tr örnek; diğerleri çevrili):
- tr: `"colCpu": "CPU", "colMem": "RAM", "colRestarts": "Yeniden başlatma", "colUptime": "Çalışma süresi"`
- en: `"colCpu": "CPU", "colMem": "Memory", "colRestarts": "Restarts", "colUptime": "Uptime"`
- zh: `"colCpu": "CPU", "colMem": "内存", "colRestarts": "重启次数", "colUptime": "运行时间"`
- es: `"colCpu": "CPU", "colMem": "Memoria", "colRestarts": "Reinicios", "colUptime": "Tiempo activo"`
- de: `"colCpu": "CPU", "colMem": "Speicher", "colRestarts": "Neustarts", "colUptime": "Laufzeit"`
- fr: `"colCpu": "CPU", "colMem": "Mémoire", "colRestarts": "Redémarrages", "colUptime": "Disponibilité"`

- [ ] **Step 3: ProcessRow.tsx — class + data-label**

`components/processes/ProcessRow.tsx`:
- Kök `<div>`'in inline `display:'grid', gridTemplateColumns:'...', gap:'12px', alignItems:'center'` KALDIR → `className="proc-row"` (kalan inline: background, border, borderRadius, padding, transition KALIR; hover handler'lar KALIR).
- Her hücreye `data-label` ekle (etiket `useTranslations` ile): CPU hücresi `data-label={t('processes.colCpu')}`, RAM `colMem`, restarts `colRestarts`, uptime `colUptime`. İsim/status/badge/aksiyon hücrelerine data-label gerekmez.

- [ ] **Step 4: globals.css — .proc-row kuralları**

Responsive bölüme ekle:
```css
.proc-row {
  display: grid;
  grid-template-columns: 7px 1fr 80px 80px 70px 70px 80px 120px;
  gap: 12px; align-items: center;
}
@media (max-width: 767px) {
  .proc-row { display: block; }
  .proc-row > * { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 3px 0; min-width: 0; }
  .proc-row > [data-label]::before {
    content: attr(data-label); color: var(--text-muted); font-size: 11px; flex-shrink: 0;
  }
  .proc-header { display: none; }
}
```
(processes/page.tsx'te kolon başlığı satırı varsa ona `className="proc-header"` ekle; yoksa bu kuralın etkisi olmaz — zararsız.)

- [ ] **Step 5: processes/page.tsx — `.page`**

Root `<div style={{ padding:'24px', overflowY:'auto', height:'100%', ... }}>` → padding/overflowY/height inline'dan KALDIR, `className="page"` ekle (animation gibi kalan inline KALIR).

- [ ] **Step 6: Testi koş — PASS**

Run: `npm run build && npx playwright test e2e/mobile.spec.ts -g processes && npm test`
Expected: processes mobil testi PASS; `npm test` (i18n bütünlüğü dahil) 12 PASS.

- [ ] **Step 7: Commit**

```bash
git add components/processes/ProcessRow.tsx "app/(panel)/processes/page.tsx" app/globals.css messages e2e/mobile.spec.ts
git commit -m "feat(responsive): processes rows -> cards on mobile (data-label)"
```

---

### Task 3: Dashboard — grid reflow

**Files:**
- Modify: `app/(panel)/dashboard/page.tsx`
- Modify: `app/globals.css` (.grid-cards)
- Modify: `e2e/mobile.spec.ts`

**Interfaces:** Consumes `.page`, `expectNoOverflow`.

- [ ] **Step 1: Failing test**
`e2e/mobile.spec.ts`'e:
```ts
test('mobil: dashboard kart grid taşmıyor (derin kontrol)', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard');
  await page.waitForTimeout(500); // metrics fetch
  await expectNoOverflow(page);
});
```
Run: `npm run build && npx playwright test e2e/mobile.spec.ts -g "kart grid"` → FAIL eğer grid sabit kolonsa.

- [ ] **Step 2: dashboard/page.tsx incele + grid'leri sınıfa çevir**
`app/(panel)/dashboard/page.tsx`'te metric kartlarını saran grid container(lar)ının inline `display:'grid', gridTemplateColumns:'...'` KALDIR → `className="grid-cards"`. Root div → `className="page"` (padding/overflow/height inline'dan kaldır). Servis-bellek satır container'ı varsa ve sabit genişlikse, ona da `flex-wrap: wrap` veren bir sınıf (`.svc-rows`) ekle veya inline `flexWrap:'wrap'` ekle (bu tek property responsive değil, her boyutta wrap zararsız).

- [ ] **Step 3: globals.css — .grid-cards**
```css
.grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
```
(auto-fit zaten her boyutta reflow eder; ayrı @media gerekmez.)

- [ ] **Step 4: Test PASS + desktop regresyon**
Run: `npm run build && npx playwright test e2e/mobile.spec.ts e2e/auth.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add "app/(panel)/dashboard/page.tsx" app/globals.css e2e/mobile.spec.ts
git commit -m "feat(responsive): dashboard card grid auto-fit reflow"
```

---

### Task 4: Domains — kart stack + modal route satırları

**Files:**
- Modify: `components/domains/DomainCard.tsx`, `components/domains/AddDomainModal.tsx`, `components/domains/EditDomainModal.tsx`
- Modify: `app/(panel)/domains/page.tsx` (root `.page`)
- Modify: `app/globals.css` (.domain-card, .route-row)
- Modify: `e2e/mobile.spec.ts`

**Interfaces:** Consumes `.page`.

- [ ] **Step 1: Failing test**
```ts
test('mobil: domains taşma yok + ekle modal sığar', async ({ page }) => {
  await login(page);
  await page.goto('/domains');
  await expectNoOverflow(page);
  await page.getByText(/Domain Ekle|Add Domain/).first().click();
  await expectNoOverflow(page);            // modal açıkken de
  await page.getByText(/Gelişmiş|Advanced/).click();   // route editörü görünür
  await expectNoOverflow(page);
});
```
Run → FAIL eğer card/modal taşıyorsa.

- [ ] **Step 2: DomainCard.tsx**
Kök `<div>`'in inline `display:'flex', alignItems:'center', gap:'12px'` KALDIR → `className="domain-card"`. Kalan inline (background/border/padding/transition + hover) KALIR.

- [ ] **Step 3: Add/Edit modal route satırları**
`AddDomainModal.tsx`'te route editör satırı (path input + port input + type select + sil butonu) saran `<div style={{ display:'flex', gap:'6px', ... }}>` → `className="route-row"` (inline display/gap kaldır).

- [ ] **Step 4: globals.css**
```css
.domain-card { display: flex; align-items: center; gap: 12px; }
.route-row { display: flex; gap: 6px; align-items: center; }
@media (max-width: 767px) {
  .domain-card { flex-wrap: wrap; align-items: flex-start; }
  .route-row { flex-wrap: wrap; }
  .route-row > * { flex: 1 1 auto; }
}
```

- [ ] **Step 5: domains/page.tsx → `.page`** (padding/overflow/height inline'dan kaldır, `className="page"`).

- [ ] **Step 6: Test PASS + desktop**
Run: `npm run build && npx playwright test e2e/mobile.spec.ts e2e/domains.spec.ts`
Expected: PASS (mobil domains + masaüstü domains CRUD).

- [ ] **Step 7: Commit**
```bash
git add components/domains "app/(panel)/domains/page.tsx" app/globals.css e2e/mobile.spec.ts
git commit -m "feat(responsive): domains card + modal route rows stack on mobile"
```

---

### Task 5: Logs — filtreler + satırlar

**Files:**
- Modify: `app/(panel)/logs/page.tsx`
- Modify: `app/globals.css` (.filters, .log-row)
- Modify: `e2e/mobile.spec.ts`

**Interfaces:** Consumes `.page`.

- [ ] **Step 1: Failing test**
```ts
test('mobil: logs taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/logs');
  await expectNoOverflow(page);
});
```

- [ ] **Step 2: logs/page.tsx**
- Root → `className="page"` (padding/overflow/height inline kaldır).
- Filtre çubuğu container'ının inline `display:'flex', gap:...` KALDIR → `className="filters"`.
- Log satırı container'ı sabit yatay düzendeyse → `className="log-row"`.

- [ ] **Step 3: globals.css**
```css
.filters { display: flex; gap: 8px; align-items: center; }
.log-row { display: flex; gap: 10px; align-items: baseline; }
@media (max-width: 767px) {
  .filters { flex-wrap: wrap; }
  .filters > * { flex: 1 1 auto; }
  .log-row { flex-direction: column; gap: 2px; align-items: stretch; }
}
```

- [ ] **Step 4: Test PASS** — `npm run build && npx playwright test e2e/mobile.spec.ts -g logs`

- [ ] **Step 5: Commit**
```bash
git add "app/(panel)/logs/page.tsx" app/globals.css e2e/mobile.spec.ts
git commit -m "feat(responsive): logs filters wrap + rows stack on mobile"
```

---

### Task 6: Settings + Login + Modal + Toast (kalan küçük parçalar)

**Files:**
- Modify: `app/(panel)/settings/page.tsx`, `app/login/page.tsx`, `components/ui.tsx`
- Modify: `app/globals.css`
- Modify: `e2e/mobile.spec.ts`

**Interfaces:** Consumes `.page`.

- [ ] **Step 1: Failing test**
```ts
test('mobil: settings + login taşma yok', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expectNoOverflow(page);
});
test('mobil: login sayfası 393px taşmıyor', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await expectNoOverflow(page);
});
```

- [ ] **Step 2: settings/page.tsx** → root `className="page"`; sistem-bilgi tablo satırları sabit yataysa `.info-row` sınıfı + `@media` stack (aşağıdaki CSS).

- [ ] **Step 3: login/page.tsx** → kartın inline `width: 360` KALDIR → `className="login-card"`.

- [ ] **Step 4: ui.tsx Modal + Toast**
- Modal iç kutu: `width` inline `width` değerini `width: min(${width}px, 100vw - 24px)` olacak şekilde değiştir: inline `width` → `style={{ width: 'min(' + width + 'px, calc(100vw - 24px))', maxWidth:'95vw', ... }}`.
- Toast container: inline `right:'20px', bottom:'20px'` kalsın; ama küçük ekran için `className="toast-wrap"` ekle.

- [ ] **Step 5: globals.css**
```css
.login-card { width: 360px; max-width: calc(100vw - 32px); }
.info-row { display: flex; justify-content: space-between; gap: 12px; }
@media (max-width: 480px) {
  .info-row { flex-direction: column; gap: 2px; }
  .toast-wrap { left: 12px; right: 12px; }
  .toast-wrap > div { max-width: none !important; }
}
```
(`.toast-wrap` topbar/ToastContainer'daki dış div'e eklenir.)

- [ ] **Step 6: Test PASS** — `npm run build && npx playwright test e2e/mobile.spec.ts`

- [ ] **Step 7: Commit**
```bash
git add "app/(panel)/settings/page.tsx" app/login/page.tsx components/ui.tsx app/globals.css e2e/mobile.spec.ts
git commit -m "feat(responsive): settings/login/modal/toast mobile fits"
```

---

### Task 7: Tam doğrulama + canlıya deploy

**Files:** (yok — doğrulama + deploy)

- [ ] **Step 1: Tüm test suiti**
Run: `npx tsc --noEmit && npm test && npm run e2e`
Expected: tsc temiz, unit 12 PASS, **tüm E2E (masaüstü 6 + mobil ~7) PASS**.

- [ ] **Step 2: Manuel genişlik matrisi (Playwright ile hızlı tarama)**
Geçici script veya `npx playwright test` mobil spec'i 360 ve 768'de de koş: `e2e/mobile.spec.ts` başına ikinci `test.describe` ile `viewport: {width:360}` ekleyip overflow kontrolü (ya da elle doğrula). Her sayfada `scrollWidth<=clientWidth`.

- [ ] **Step 3: Commit (varsa) + push (CI doğrular)**
```bash
git push    # GitHub Actions: tsc+test+build+e2e (mobil dahil) yeşil olmalı
```

- [ ] **Step 4: Canlıya deploy (yedek+rollback)**
Run: `bash deploy.sh`
Expected: health ok, caddy valid. Sonra `panel.zolvix.app`'i gerçek telefonda aç, drawer + kartları doğrula.

- [ ] **Step 5: Rollback hazır** — sorun olursa `ssh root@191.44.68.81 "cd /opt/zolpanel && tar xzf /tmp/zolpanel-bak-<ts>.tgz && npm run build && pm2 restart zolpanel"`.

---

## Self-Review Notları (yazar kontrolü)

- **Spec kapsamı:** §4 foundation→T1; §5 shell→T1; §6 dashboard→T3, domains→T4, processes→T2, logs→T5, settings/login/modal/toast→T6; §7 tablo-kart→T2; §8 test→her task + T7. Hepsi kapsandı.
- **`.page` bağımlılığı:** T1 tanımlar; T2–T6 her sayfa root'una uygular (tekrar tekrar belirtildi).
- **i18n anahtarları:** sadece T2 yeni anahtar (`processes.colCpu/colMem/colRestarts/colUptime`, 6 dil). `npm test` namespace bütünlüğünü doğrular.
- **Inline-ezer riski:** her task "inline'dan KALDIR → sınıfa taşı" diye açıkça belirtir (kritik nokta).
- **Tip/isim tutarlılığı:** `expectNoOverflow`, `.page/.sidebar/.proc-row/.grid-cards/.domain-card/.route-row/.filters/.log-row/.login-card/.info-row/.toast-wrap` tüm task'larda aynı adlarla.
