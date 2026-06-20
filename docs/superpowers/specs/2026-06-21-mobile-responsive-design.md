# Zolpanel — Mobil Uyumluluk (Responsive) Tasarımı

**Tarih:** 2026-06-21
**Durum:** Onaylandı (tasarım), spec inceleme bekliyor
**Kapsam:** Tüm paneli (login + 5 panel sayfası + ortak bileşenler) telefon ve tablette sorunsuz çalışır hale getirmek. Hedef: **360px genişliğe kadar** yatay taşma olmadan, okunabilir. CSS-first yaklaşım (inline-style mimarisi korunur).

---

## 1. Amaç & Başarı Kriteri

- Panel şu an **tamamen sabit-genişlik** (sıfır media query). Mobilde sidebar ekranı yiyor, yoğun tablolar (özellikle `ProcessRow`'un 8 sütunu) taşıyor.
- **Başarı kriteri:** 360 / 414 / 768 / 1024 px genişliklerde her sayfa:
  - Yatay scroll YOK (`document.body.scrollWidth <= window.innerWidth`).
  - Tüm aksiyonlar erişilebilir (drawer'dan navigasyon, kartlardan butonlar).
  - Okunabilir (taşan/kesilen metin yok).
- Davranış değişikliği yok; yalnızca düzen (layout) responsive olur.

## 2. Kapsam Dışı (Non-Goals)

- Görsel yeniden tasarım / tema değişikliği (renkler, tipografi aynı kalır).
- Dokunmatik jestler (swipe-to-open vb.) — drawer butonla açılır.
- PWA / offline / native app.
- 360px altı (çok eski cihazlar) garanti edilmez.

## 3. Yaklaşım: CSS-first

Inline stil, media-query CSS sınıfını **ezer** (specificity). Bu yüzden:
- **Kozmetik inline stiller kalır** (renk, font, border, küçük boşluklar).
- **Responsive olan layout property'leri** (`display`, `width`, `grid-template-columns`, `flex-direction`, breakpoint'te değişen `padding`/`gap`) inline'dan **`globals.css`'teki sınıflara taşınır**.
- Koşullu render için JS hook KULLANILMAZ (SSR flash/hydration riski yok). Tablolar `data-label` + CSS tekniğiyle karta döner. Tek JS state: drawer aç/kapa (`useState`, layout'ta).

### Breakpoint'ler
- Ana: **768px** (`max-width: 767px` = mobil: drawer + kart modu).
- İkincil: **480px** (`max-width: 480px` = telefon: daha sıkı padding, tek-kolon, ikon-only çıkış).
- `≥768px`: mevcut masaüstü görünümü birebir korunur.

## 4. `globals.css` — eklenecek responsive katman

Mevcut `:root` değişkenleri korunur (`--sidebar-width: 200px`, `--topbar-height: 52px`). Eklenecek sınıflar (base = masaüstü; `@media` = mobil override):

- **Shell:** `.app-shell` (flex row), `.sidebar` (≥768 statik 200px; <768 fixed off-canvas drawer, `translateX(-100%)`, `.sidebar.open`→`translateX(0)`, width 240px, z-index 200, transition), `.sidebar-backdrop` (fixed inset-0, z-index 150, yalnız <768 & açıkken), `.hamburger` (≥768 `display:none`, <768 görünür), `.topbar`, `.page` (içerik padding: 24px → <768 16px → <480 12px).
- **Grid/kart:** `.grid-cards` (`grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`), `.proc-row` (≥768 8-sütun grid; <768 `display:block` + hücreler `data-label` ile etiket:değer), `.domain-card` (flex; <768 `flex-wrap:wrap`/stack), `.log-row`, `.filters` (`flex-wrap:wrap`).
- `@media (max-width: 767px)`: drawer mekaniği, `.grid-cards` daralır, `.proc-row` kart olur, başlık satırı `display:none`, `.page` padding 16px.
- `@media (max-width: 480px)`: padding 12px, çıkış butonu ikon-only, toast tam-genişlik.

> Boyut yönetilebilir kalsın diye responsive sınıflar `globals.css` içinde tek bir "Responsive" bölümünde toplanır.

## 5. Layout shell — `app/(panel)/layout.tsx`

- `const [drawerOpen, setDrawerOpen] = useState(false)`.
- Kök `<div className="app-shell">`; sidebar `<aside className={"sidebar" + (drawerOpen ? " open" : "")}>` — inline `width` KALDIRILIR (sınıfa taşınır).
- Topbar'a `<button className="hamburger" onClick={()=>setDrawerOpen(true)}>☰</button>` (en solda); başlık; sağda dil + çıkış.
- `{drawerOpen && <div className="sidebar-backdrop" onClick={()=>setDrawerOpen(false)} />}`.
- Nav `<Link>` `onClick` → `setDrawerOpen(false)` (mobilde seçince kapanır).
- `<480`: çıkış butonu metni gizlenir (ikon kalır) — CSS.
- Davranış ≥768'de değişmez (hamburger gizli, backdrop yok, sidebar statik).

## 6. Ekran ekran responsive davranış

| Ekran / dosya | `<768` davranışı (CSS sınıfları ile) |
|---|---|
| **Dashboard** `dashboard/page.tsx` | metric kart konteynerleri → `.grid-cards` (auto-fit 1–2 kolon); servis-bellek satırları wrap/stack; sparkline 80px korunur |
| **Domains** `components/domains/DomainCard.tsx` | `.domain-card`: durum+isim üstte, badge+aksiyon altta (`flex-wrap`/stack) |
| **Domains modalleri** `AddDomainModal/EditDomainModal` | route satırı (path/port/type) dikey; FormField'lar zaten `width:100%` |
| **Processes** `components/processes/ProcessRow.tsx` | `.proc-row`: 8-sütun grid → dikey kart; her hücrede `data-label` (Status/CPU/RAM/Restarts/Uptime), CSS `::before` ile etiket; başlık satırı gizli |
| **Logs** `logs/page.tsx` | `.filters` `flex-wrap`; `.log-row` zaman/seviye/mesaj stack |
| **Settings** `settings/page.tsx` | formlar zaten uygun; sistem-bilgi tablosu stack; padding düşer |
| **Login** `login/page.tsx` | kart `width: min(360px, 100vw − 32px)` |
| **Modal** `components/ui.tsx` | mevcut `maxWidth:95vw` korunur; telefonda `width: min(width, 100vw − 24px)` |
| **Toast** `components/ui.tsx` | `<480`: `left:12px; right:12px; maxWidth:none` |

## 7. Tablo→kart tekniği (JS'siz)

`ProcessRow` hücrelerine sabit `data-label` eklenir (i18n metni `t('processes.colCpu')` vb. ile; etiketler CSS `content: attr(data-label)` ile gösterilir — yeni i18n anahtarları gerekebilir: `processes.colCpu/colMem/colRestarts/colUptime`, 6 dilde). `@media (max-width:767px)`:
```
.proc-row { display: block; }
.proc-row > * { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.proc-row > [data-label]::before { content: attr(data-label); color: var(--text-muted); font-size: 11px; }
.proc-header { display: none; }  /* varsa başlık satırı */
```
SSR-doğru, flash yok.

## 8. Test & Doğrulama

- **Playwright:** `playwright.config.ts`'e mobil viewport projesi (ör. 393×851). Yeni `e2e/mobile.spec.ts`:
  - hamburger görünür, sidebar başlangıçta gizli, hamburger→drawer açılır, nav linki çalışır + drawer kapanır.
  - processes/domains satırları kart olarak render (desktop grid değil).
  - **Yatay taşma yok:** her panel sayfasında `expect(scrollWidth <= innerWidth)`.
- Masaüstü E2E'ler (mevcut 6) regresyonsuz geçer.
- **Manuel matris:** 360 / 414 / 768 / 1024 — her sayfa; özellikle 360px'de yatay scroll kontrolü.
- CI bu testleri otomatik koşar.
- Sonra canlıya deploy (`deploy.sh`, yedek+rollback) + gerçek telefonda kontrol.

## 9. Riskler & Önlemler

| Risk | Önlem |
|---|---|
| Inline stil media-query'i ezer (responsive çalışmaz) | Responsive layout property'leri inline'dan sınıfa TAŞINIR (kozmetik kalır) — refactor disiplini |
| `≥768` masaüstü görünümü bozulur | Sınıfların base (desktop) kuralları mevcut inline değerlerle birebir aynı olur; her değişiklikten sonra desktop E2E koşar |
| Tablo→kart etiketleri eksik | `data-label` için i18n anahtarları 6 dilde eklenir |
| Drawer açıkken arka plan kayar | `<768` & açıkken `body { overflow:hidden }` (sınıf ile) opsiyonel |

## 10. Açık Sorular
Yok — breakpoint (768/480, 360'a kadar), nav deseni (hamburger drawer), tablo deseni (kart), yaklaşım (CSS-first) onaylandı.
