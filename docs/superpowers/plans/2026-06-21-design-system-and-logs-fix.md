# Design System Application + Logs Mobile-Nav Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `design-system/MASTER.md`'yi tüm panele (web + mobil) uygulamak — emoji→Lucide SVG ikonlar, görünür focus ring'ler, `prefers-reduced-motion`, tipografi ölçeği, `tabular-nums`, a11y (aria-label, ≥44px dokunma, toast aria-live), form alan-altı hata geri bildirimi — ve telefonda Logs'a girince sol menünün kaybolması bug'ını düzeltmek.

**Architecture:** Mevcut palet/spacing/radius/layout token'ları MASTER ile zaten birebir — DEĞİŞMEZ. Değişen: ikon ailesi (emoji → `lucide-react`), `app/globals.css`'e a11y/motion/typography katmanı, ikon-buton erişilebilirliği. Stil yine inline + sınıf hibriti; responsive sınıflar (Task'lar öncesi mevcut) korunur. Logs bug'ı önce düzeltilir (bağımsız).

**Tech Stack:** Next.js 15 (App Router), TypeScript, plain CSS (`app/globals.css`), `lucide-react`, Playwright, next-intl.

## Global Constraints

- **Dark-only**, palet DEĞİŞMEZ (MASTER §2 token'ları = mevcut globals.css). Slate/green alternatifi (MASTER §171) UYGULANMAZ.
- **Emoji ikon YASAK** → tümü `lucide-react` SVG. Tek aile, `strokeWidth={1.75}`, `currentColor` (renk parent'tan). Boyut: sm=16, md=20.
- **İkon-only butona `aria-label` ZORUNLU**; mevcut `title` (tooltip) KORUNUR (e2e `getByTitle` bozulmasın). Dokunma hedefi mobilde **≥44px**.
- **Focus:** `outline:none` kaldırılır; tüm interaktiflerde görünür `:focus-visible` ring (`--accent`).
- **`prefers-reduced-motion: reduce`** → animasyon/transition kapat.
- **Tipografi ölçeği (MASTER §3):** h1 20px/600, h2 16px/600, h3 14px/500, gövde 14/400, label 13/500, mikro 12/400. Sayısal/metrik/mono → `tabular-nums`.
- **Form (MASTER §7):** görünür label (mevcut), hata **alan altında** + `aria-invalid`, blur'da doğrulama, submit feedback.
- **Toast:** `aria-live="polite"`, 3–5sn, focus çalmaz.
- `≥768px` masaüstü görünümü ikon değişimi dışında bozulmaz; ikonlar emoji ile aynı yerde/boyutta durur.
- Breakpoint'ler 480/768. Mevcut responsive sınıflar (`.sidebar .app-shell .hamburger .page .proc-row .grid-5 .grid-4 .domain-card .route-row .filters .log-row .cols-2 .login-card .info-row .toast-wrap`) KORUNUR.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Windows: build EPERM → `rm -rf .next` + retry.

### Emoji → Lucide eşleme tablosu (TÜM ikon task'larında bu kullanılır)
| Yer | Emoji | Lucide bileşeni |
|---|---|---|
| nav: dashboard | ▦ | `LayoutDashboard` |
| nav: domains | ⬡ | `Globe` |
| nav: processes | ⚙ | `Cpu` |
| nav: logs | ≡ | `ScrollText` |
| nav: settings | ◎ | `Settings` |
| hamburger | ☰ | `Menu` |
| modal kapat | ✕ | `X` |
| durdur (pause) | ⏸ | `Pause` |
| başlat (play) | ▶ | `Play` |
| sil | 🗑 | `Trash2` |
| düzenle | ✏️ | `Pencil` |
| yeniden yükle | ↻ | `RotateCw` |
| ekle | + (metin) | `Plus` |
| SSL aktif | 🔒 | `Lock` |
| SSL pending | ⏳ | `Clock` |
| anomali/uyarı | ⚠️ | `AlertTriangle` |
| trend artış | ↑ | `TrendingUp` |
| trend stabil | ✓ | `Check` |
| caddy çalışıyor | ✅ | `CheckCircle2` |
| caddy durdu | ❌ | `XCircle` |
| domain tipi proxy | 🔀 | `Shuffle` |
| domain tipi static | 📁 | `Folder` |
| domain tipi advanced | ⚙️ | `SlidersHorizontal` |
| boş durum: domains | 🌐 | `Globe` |
| boş durum: processes | (varsa) | `ServerOff` |

---

### Task 1: Logs mobil-menü bug'ı — teşhis + düzeltme

**Files:**
- Modify: muhtemelen `app/(panel)/logs/page.tsx` ve/veya `app/globals.css` (teşhise göre)
- Modify: `e2e/mobile.spec.ts` (regresyon testi)

**Interfaces:** Consumes `expectNoOverflow` yok; sadece nav/hamburger görünürlüğü.

- [ ] **Step 1: Failing regresyon testi** — `e2e/mobile.spec.ts` sonuna:
```ts
test('mobil: logs sayfasında hamburger erişilebilir, drawer açılıp nav çalışır', async ({ page }) => {
  await page.route('**/api/system/logs**', r => r.request().method()==='GET'
    ? r.fulfill({ json: [{ _id:'l1', domain:'system', level:'info', message:'x', timestamp:'2026-01-01T00:00:00Z' }] }) : r.continue());
  await login(page);
  await page.goto('/logs');
  // hamburger görünür ve drawer açılıp başka sayfaya geçiş yapılabilmeli
  const burger = page.getByRole('button', { name: /menü|menu|☰/i });
  await expect(burger).toBeVisible();
  await burger.click();
  await expect(page.getByRole('link', { name: /Panel|Dashboard/ })).toBeVisible();
  await page.getByRole('link', { name: /Panel|Dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
```
Run: `npm run build && npx playwright test e2e/mobile.spec.ts -g "logs sayfasında hamburger"` → muhtemelen FAIL (bug'ı yakalar).

- [ ] **Step 2: Teşhis.** Read `app/(panel)/logs/page.tsx`. Şüphe: logs kökü `.log-shell { height:100% }` + olası `position`/`overflow` ya da yüksek `z-index`/`height:100vh` topbar'ı (dolayısıyla hamburger'ı) örtüyor veya iç scroller layout'u bozuyor. Olası ikinci sebep: logs içeriği `height:100vh` veya `position:fixed` ile topbar'ın üstünü kaplıyor. `app/(panel)/layout.tsx`'te topbar `flex-shrink:0` ve içerik `<div style={{flex:1, overflow:'hidden'}}>` — logs page'in içindeki bir eleman bu içerik kutusundan taşıp topbar'ı örtüyor olabilir. **Kök nedeni bul** (DevTools yerine: kodu oku + testte `await expect(page.locator('.hamburger')).toBeVisible()` ve gerekiyorsa `boundingBox` ile topbar'ın kapanıp kapanmadığını ölç).

- [ ] **Step 3: Düzelt.** Kök nedene göre minimal düzeltme. Muhtemel düzeltme: logs page kökünün `.log-shell`'i içerik kutusunu aşmasın → `min-height:0` ekle (flex çocuk taşmasını önler) veya `height:100%` yerine `flex:1; min-height:0`. Topbar/hamburger her zaman görünür kalmalı. Davranış: ≥768 sidebar statik, <768 hamburger + drawer — logs dahil TÜM sayfalarda aynı.

- [ ] **Step 4: Testi koş — PASS** + tam mobil spec regresyon:
`npm run build && npx playwright test e2e/mobile.spec.ts` → tüm mobil testler PASS.

- [ ] **Step 5: Commit**
```
git add "app/(panel)/logs/page.tsx" app/globals.css e2e/mobile.spec.ts
git commit -m "fix(mobile): logs sayfasında hamburger/drawer erişilebilir kalır"
```

---

### Task 2: Tasarım temeli — lucide kurulumu + globals.css (focus/motion/typografi/tabular)

**Files:**
- Modify: `package.json` (+`lucide-react`)
- Modify: `app/globals.css`

**Interfaces:** Produces global CSS: görünür focus ring, `prefers-reduced-motion`, `.tabular` util, `.icon-btn` (≥44px mobil dokunma), tipografi base.

- [ ] **Step 1:** `npm install lucide-react` (dependency). Doğrula: `node -e "require.resolve('lucide-react')"`.

- [ ] **Step 2:** `app/globals.css`'i düzenle:
  - `button { ... }` ve `input,select,textarea { ... }` bloklarından `outline: none;` SATIRLARINI KALDIR.
  - Reset'ten sonra ekle:
```css
/* Görünür focus (klavye) */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius);
}
/* Tabular figürler (metrik/sayısal) */
.tabular { font-variant-numeric: tabular-nums; }
/* İkon buton: mobilde ≥44px dokunma hedefi */
.icon-btn { display: inline-flex; align-items: center; justify-content: center; }
@media (max-width: 767px) { .icon-btn { min-width: 44px; min-height: 44px; } }
/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
}
```
  - (Renk/spacing/radius token'larına DOKUNMA — MASTER ile zaten uyumlu.)

- [ ] **Step 3:** `npm run build` → başarılı. `npx tsc --noEmit` → temiz. `npm run e2e` → mevcut 18 test hâlâ PASS (focus/motion görünürü bozmaz).

- [ ] **Step 4: Commit**
```
git add package.json package-lock.json app/globals.css
git commit -m "feat(design): lucide-react + focus-visible, reduced-motion, tabular utils"
```

---

### Task 3: İkonlar — layout nav + hamburger + Modal kapat (a11y + e2e)

**Files:**
- Modify: `app/(panel)/layout.tsx`, `components/ui.tsx`
- Modify: `e2e/mobile.spec.ts`, `e2e/i18n.spec.ts` (hamburger selektörü)

**Interfaces:** Consumes lucide (Task 2). Produces: nav artık Lucide ikonlu; hamburger `aria-label="menu"`.

- [ ] **Step 1:** `layout.tsx`:
  - `import { LayoutDashboard, Globe, Cpu, ScrollText, Settings, Menu } from 'lucide-react';`
  - `NavItemDef`'in `icon: string` alanını `icon: React.ComponentType<{ size?: number }>` yap; `NAV_ITEMS`: `{ id:'dashboard', icon: LayoutDashboard, href:'/dashboard' }`, domains→Globe, processes→Cpu, logs→ScrollText, settings→Settings.
  - `NavItem` içinde emoji `<span>{item.icon}</span>` yerine `<item.icon size={18} />` (renk parent'tan currentColor; mevcut `opacity` span'ını koru veya ikona uygula).
  - Hamburger butonu: `aria-label="menu"` (mevcut `aria-label="☰"` DEĞİŞİR), içerik `☰` yerine `<Menu size={18} />`. `className="hamburger"` korunur.
- [ ] **Step 2:** `components/ui.tsx` `Modal` kapat butonu: `import { X } from 'lucide-react';`, `✕` yerine `<X size={16} />`, butona `aria-label="kapat"` ekle. (Btn ghost size sm korunur.)
- [ ] **Step 3:** e2e selektör güncelle: `e2e/mobile.spec.ts` ve `e2e/i18n.spec.ts` içinde `getByRole('button', { name: '☰' })` → `getByRole('button', { name: 'menu' })`. (Task 1'de eklenen test zaten `/menü|menu|☰/i` regex — dokunma.)
- [ ] **Step 4:** `npm run build && npx playwright test e2e/ && npx tsc --noEmit` → hepsi PASS, tsc temiz. Emoji nav/hamburger gitti.
- [ ] **Step 5: Commit**
```
git add "app/(panel)/layout.tsx" components/ui.tsx e2e/mobile.spec.ts e2e/i18n.spec.ts
git commit -m "feat(design): nav + hamburger + modal close -> lucide icons (aria-labels)"
```

---

### Task 4: İkonlar — domains (kart aksiyonları, SSL, modal tip butonları, boş durum)

**Files:**
- Modify: `components/domains/DomainCard.tsx`, `components/domains/AddDomainModal.tsx`, `components/domains/EditDomainModal.tsx`, `app/(panel)/domains/page.tsx`
- Modify: `e2e/domains.spec.ts`, `e2e/mobile-360.spec.ts` (gerekiyorsa selektör)

**Interfaces:** Consumes lucide. KORU: her ikon-buton `title` (Durdur/Aktif Et/Sil/Düzenle) AYNEN kalır (e2e `getByTitle` bağımlı). `aria-label` = title ile aynı ekle.

- [ ] **Step 1:** `DomainCard.tsx`: `import { Pause, Play, Pencil, Trash2, Lock, Clock } from 'lucide-react';`
  - SSL badge: `🔒`(active)/`⏳`(pending) → `<Lock size={12} />` / `<Clock size={12} />` (Badge içinde, metin "SSL" korunur).
  - IconBtn'ler: `⏸`/`▶` → `<Pause size={14}/>`/`<Play size={14}/>` (toggle), `✏️`→`<Pencil size={14}/>`, `🗑`→`<Trash2 size={14}/>`. Her IconBtn'e `className="icon-btn"` + `aria-label={title}` ekle; `title` korunur.
- [ ] **Step 2:** `AddDomainModal.tsx`: `import { Shuffle, Folder, SlidersHorizontal } from 'lucide-react';` — tip butonları `🔀 Proxy`/`📁 Static`/`⚙️ Gelişmiş` → `<Shuffle size={16}/> {label}` vb. (metin korunur). `✕` kapat zaten Modal'da (Task 3). Route satırındaki sil butonu varsa `Trash2`/`X` + aria-label.
- [ ] **Step 3:** `EditDomainModal.tsx`: aynı tip/aksiyon ikonları varsa Lucide'a çevir (yoksa atla).
- [ ] **Step 4:** `domains/page.tsx`: EmptyState `icon="🌐"` → `<Globe size={32} />` (`import { Globe }`). "+ Domain Ekle" butonundaki `+` metni kalabilir veya `<Plus size={14}/>` eklenir (metin korunur).
- [ ] **Step 5:** e2e: `domains.spec.ts`/`mobile-360.spec.ts` toggle/sil seçimi `getByTitle('Durdur'|'Aktif Et'|'Sil')` ile yapıyorsa — title korunduğu için DEĞİŞMEZ. Sadece emoji-text selektörü varsa güncelle. Doğrula.
- [ ] **Step 6:** `npm run build && npx playwright test e2e/ && npx tsc --noEmit` → PASS.
- [ ] **Step 7: Commit**
```
git add components/domains "app/(panel)/domains/page.tsx" e2e
git commit -m "feat(design): domains icons -> lucide (card actions, ssl, type buttons, empty)"
```

---

### Task 5: İkonlar — processes (satır aksiyonları, LogModal, sayfa, boş durum)

**Files:**
- Modify: `components/processes/ProcessRow.tsx`, `components/processes/shared.tsx`, `components/processes/LogModal.tsx`, `components/processes/StartProcessModal.tsx`, `app/(panel)/processes/page.tsx`

**Interfaces:** Consumes lucide. KORU: action buton `title`'ları (e2e bağımlı olabilir) + ekle `aria-label`.

- [ ] **Step 1:** `ProcessRow.tsx` / `shared.tsx` (`ProcBtn`): action ikonları `⏸`→`Pause`, `▶`→`Play`, `↻`→`RotateCw`, `🗑`→`Trash2` (logs görüntüle butonu varsa `ScrollText`/`FileText`). `import { Pause, Play, RotateCw, Trash2, FileText } from 'lucide-react';`. Her butona `className="icon-btn"` + `aria-label` (mevcut title korunur). `data-label` hücreleri DOKUNULMAZ.
- [ ] **Step 2:** `LogModal.tsx`: `↻` → `<RotateCw size={12}/>`.
- [ ] **Step 3:** `processes/page.tsx`: `↻` refresh → `RotateCw`; başlıktaki `⚙️` varsa `Cpu`; EmptyState ikonu → `ServerOff` (`import { ServerOff }`).
- [ ] **Step 4:** `StartProcessModal.tsx`: emoji varsa Lucide'a çevir (yoksa atla).
- [ ] **Step 5:** `npm run build && npx playwright test e2e/ && npx tsc --noEmit` → PASS (processes mobil mock testi + desktop). 
- [ ] **Step 6: Commit**
```
git add components/processes "app/(panel)/processes/page.tsx"
git commit -m "feat(design): processes icons -> lucide (row actions, logmodal, empty)"
```

---

### Task 6: İkonlar — dashboard + settings + logs + tabular-nums

**Files:**
- Modify: `app/(panel)/dashboard/page.tsx`, `app/(panel)/settings/page.tsx`, `app/(panel)/logs/page.tsx`, `components/ui.tsx` (`MetricCard` tabular)

**Interfaces:** Consumes lucide + `.tabular` (Task 2).

- [ ] **Step 1:** `dashboard/page.tsx`: `import { AlertTriangle, TrendingUp, Check, RotateCw, Clock } from 'lucide-react';`
  - `AnomalyBadge`: `⚠️`→`<AlertTriangle size={12}/>`, `↑`→`<TrendingUp size={12}/>`, `✓`→`<Check size={12}/>` (metinler korunur).
  - Caddy reload `↻`→`RotateCw`. Recent-domains SSL `⏳`→`Clock`.
  - Metrik değerleri (RAM/CPU/sayılar) zaten mono; `MetricCard` value'suna ve sayısal `<span>`'lara `className="tabular"` ekle (kayma önler).
- [ ] **Step 2:** `settings/page.tsx`: sistem-bilgi tablosunda Caddy satırı `✅`/`❌` → `<CheckCircle2 size={14} style={{color:'var(--green)'}}/>` / `<XCircle size={14} style={{color:'var(--red)'}}/>` (`import { CheckCircle2, XCircle, RotateCw }`); reload `↻`→`RotateCw`. Tablo değer hücrelerine `className="tabular"` (RAM/Disk/CPU).
- [ ] **Step 3:** `logs/page.tsx`: `↻` (varsa) → `RotateCw`. Zaman damgası `<span>`'ına `tabular`.
- [ ] **Step 4:** `components/ui.tsx` `MetricCard`: value `<p>`'sine `className="tabular"` (zaten mono; tabular pekiştirir).
- [ ] **Step 5:** `npm run build && npx playwright test e2e/ && npx tsc --noEmit && npm test` → PASS.
- [ ] **Step 6: Commit**
```
git add "app/(panel)/dashboard/page.tsx" "app/(panel)/settings/page.tsx" "app/(panel)/logs/page.tsx" components/ui.tsx
git commit -m "feat(design): dashboard/settings/logs icons -> lucide + tabular-nums"
```

---

### Task 7: Tipografi ölçeği + form alan-altı hata geri bildirimi

**Files:**
- Modify: `app/(panel)/*/page.tsx` (başlık boyutları), `app/login/page.tsx`, `components/domains/AddDomainModal.tsx`, `app/(panel)/settings/page.tsx`, `components/ui.tsx` (`FormField` hata desteği)

**Interfaces:** Produces `FormField` opsiyonel `error?: string` prop.

- [ ] **Step 1: Tipografi (MASTER §3).** Sayfa başlıkları: her panel sayfasındaki ana `<h2 style={{ fontSize:'15px'... }}>` → `16px`/`600` (MASTER h2). Login `<h1 fontSize:'18px'>` → `20px`/`600` (MASTER h1). Diğer başlık/label boyutları ölçeğe uydur (h3 14/500, label 13/500). KÜÇÜK, görsel-uyum amaçlı; davranış değişmez.
- [ ] **Step 2: `FormField` hata desteği** (`components/ui.tsx`): `FormFieldProps`'a `error?: React.ReactNode` ekle; varsa input altında `--red` ile `<p role="alert" style={{ fontSize:'11px', color:'var(--red)', marginTop:'4px' }}>{error}</p>` render et; ilgili input'a tüketicide `aria-invalid` set edilir.
- [ ] **Step 3: change-password formu (settings):** mevcut toast-bazlı doğrulamayı koru AMA alan-altı hata da göster — `next`/`confirm` için blur'da kontrol edip `FormField error` ver (`passwordMismatch`/`passwordTooShort` mesajları zaten i18n'de). `aria-invalid` ekle.
- [ ] **Step 4: add-domain formu:** domain/port alanlarına blur doğrulaması + `FormField error` (boş/geçersiz). i18n: gerekiyorsa `domains.errInvalidDomain`/`errPortRange` ekle (6 dil) veya mevcut generic mesaj.
- [ ] **Step 5:** `npm run build && npx playwright test e2e/ && npx tsc --noEmit && npm test` → PASS. (Login/domains e2e akışları bozulmamalı.)
- [ ] **Step 6: Commit**
```
git add app components messages
git commit -m "feat(design): type scale alignment + field-level form errors (aria-invalid)"
```

---

### Task 8: Final doğrulama + checklist + deploy

**Files:** (doğrulama + deploy)

- [ ] **Step 1: Emoji kalmadı doğrula:** `grep -rnE "[☰▦⬡⚙≡◎⏸▶🗑✏️✕↻🔒⏳⚠️✅❌🌐📁🔀]" app components | grep -v data-label` → BOŞ olmalı (kalan varsa düzelt). 
- [ ] **Step 2: Tam suit:** `npx tsc --noEmit && npm test && npm run e2e` → tsc temiz, unit 12, E2E hepsi PASS (desktop + 393 + 360 + logs-nav).
- [ ] **Step 3: MASTER §12 checklist** gözden geçir: emoji yok ✓, focus-visible ✓, reduced-motion ✓, durum renk+ikon ✓, ikon-buton aria-label + ≥44px ✓, tabular ✓.
- [ ] **Step 4: push (CI):** `git push` → GitHub Actions yeşil.
- [ ] **Step 5: deploy:** `bash deploy.sh` → health ok + caddy valid. Served CSS/JS'te Lucide (SVG) geldiğini ve `:focus-visible` kuralını doğrula.
- [ ] **Step 6: rollback hazır:** sorun olursa `ssh root@191.44.68.81 "cd /opt/zolpanel && tar xzf /tmp/zolpanel-bak-<ts>.tgz && npm run build && pm2 restart zolpanel"`.

---

## Self-Review (yazar)
- **MASTER kapsamı:** §2 palet (değişmez, no-op) · §3 tipografi→T6/T7 · §5 focus/motion→T2 · §6 reduced-motion→T2 · §7 form→T7 · §8 ikonlar+aria+44px→T2–T6 · §10 tabular→T6 · §11 anti-patterns (emoji/focus)→T2–T6,T8 · §12 checklist→T8. Logs bug→T1. Tümü kapsandı.
- **e2e kırılganlığı:** hamburger `name:'☰'`→`'menu'` (T3'te güncellenir); diğer ikon-butonlar `title` koruduğu için `getByTitle` bozulmaz.
- **No-op riski:** palet/spacing zaten uyumlu — bilinçli olarak değiştirilmez (MASTER "birebir" diyor).
- **Tip tutarlılığı:** `NavItemDef.icon` `string`→`ComponentType` (T3); `FormFieldProps.error` (T7) tüm tüketicilerde opsiyonel. `.icon-btn`/`.tabular` T2'de tanımlı, T3–T6'da kullanılır.
