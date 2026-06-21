# Zolpanel — Design System (MASTER)

> Source of Truth. Bu dosya tüm panelin görsel/UX standardıdır.
> Tema: **Dark Mode (OLED-friendly), devops/teknik**. Sadece koyu mod desteklenir.
> Tek bir sayfa bu kurallardan sapacaksa → `design-system/pages/<sayfa>.md` oluştur; o dosya bu Master'ı override eder.

---

## 1. Tasarım Yönü (Pattern)

- **Tip:** Real-Time / Operations panel (ops · server · monitoring)
- **Atmosfer:** Veri-yoğun ama taranabilir, yüksek kontrast, düşük beyaz emisyon (göz yormayan)
- **Renk stratejisi:** Nötr koyu zemin + tek vurgu rengi (mavi) + semantik durum renkleri (green/amber/red)
- **Prensip:** Her ekranda **tek bir birincil eylem** (primary CTA). İkincil eylemler görsel olarak geri planda.

---

## 2. Renk Tokenları (mevcut `app/globals.css` ile birebir)

| Rol | Token | Hex | Kullanım |
|-----|-------|-----|----------|
| Zemin (en alt) | `--bg-base` | `#1f1f1f` | Sayfa arka planı |
| Yüzey | `--bg-surface` | `#171717` | Kart/panel/input zemini |
| Yükseltilmiş | `--bg-elevated` | `#252525` | Dropdown, modal, popover |
| Hover | `--bg-hover` | `#2a2a2a` | Hover durumu |
| Active | `--bg-active` | `#303030` | Basılı / seçili |
| Kenarlık | `--border` | `#2e2e2e` | Varsayılan ayraç |
| Kenarlık (açık) | `--border-light` | `#383838` | Vurgulu ayraç, scrollbar |
| Metin (birincil) | `--text-primary` | `#e8e8e8` | Başlık & gövde |
| Metin (ikincil) | `--text-secondary` | `#888` | Açıklama, label |
| Metin (silik) | `--text-muted` | `#555` | Placeholder, disabled |
| **Accent / CTA** | `--accent` | `#3b82f6` | Birincil eylem, link, focus |
| Accent hover | `--accent-hover` | `#2563eb` | CTA hover |

### Semantik durum renkleri (status)
| Anlam | Token | Hex | Nerede |
|-------|-------|-----|--------|
| Başarılı / çalışıyor | `--green` | `#22c55e` | "online", success toast, healthy |
| Uyarı / bekliyor | `--yellow` | `#f59e0b` | "warning", pending, yüksek yük |
| Hata / durdu | `--red` | `#ef4444` | "offline", error, destructive |
| Bilgi / etiket | `--purple` | `#a78bfa` | rozet, kategori vurgusu |

> **Kural (`color-not-only`):** Durumu yalnızca renkle anlatma. Daima ikon veya metin de ekle (örn. ● yeşil + "Online").
> **Kontrast:** Gövde metni zemine karşı ≥ 4.5:1, ikincil metin ≥ 3:1. `--text-muted` yalnızca disabled/placeholder için — gövde metninde kullanma.

---

## 3. Tipografi

- **Gövde / UI:** `IBM Plex Sans` (`--font-sans`)
- **Mono / veri / kod / IP / metrik:** `JetBrains Mono` (`--font-mono`)
- **Tabular figürler:** Sayısal kolonlar, metrikler, port/IP, fiyat → mono veya `font-variant-numeric: tabular-nums` (kayma önler).

### Ölçek (type scale)
| Rol | Boyut | Weight | Line-height |
|-----|-------|--------|-------------|
| Sayfa başlığı (h1) | 20px | 600 | 1.3 |
| Bölüm başlığı (h2) | 16px | 600 | 1.4 |
| Alt başlık (h3) | 14px | 500 | 1.4 |
| Gövde | 14px | 400 | 1.5 |
| Küçük / label | 13px | 500 | 1.4 |
| Mikro / yardımcı | 12px | 400 | 1.4 |

> Mobilde gövde ≥ 16px tercih edilir (iOS otomatik zoom'u önler); panel desktop-öncelikli olduğundan 14px taban kabul, ancak input metni 16px düşünülebilir.

---

## 4. Spacing, Radius, Layout

- **Spacing ritmi:** 4 / 8 tabanlı → `4, 8, 12, 16, 24, 32, 48`. Rastgele değer yok.
- **Radius:** `--radius` 6px (input/button/kart), `--radius-lg` 10px (modal/büyük kart).
- **Layout sabitleri:** `--sidebar-width` 200px, `--topbar-height` 52px.
- **Sayfa padding:** desktop 24px · tablet 16px · mobil (<480px) 12px.
- **Breakpoint:** 480 / 768 / 1024 / 1440. Mobilde sidebar drawer'a (240px) dönüşür + backdrop.
- **z-index ölçeği:** backdrop 150 · sidebar 200 · (modal/toast bunların üstünde, ör. 1000) tanımlı tut.

---

## 5. Efektler & Etkileşim

- **Gölge:** Koyu temada minimal. Elevation'ı zemin rengiyle ifade et (`bg-elevated`), ağır gölge kullanma. Modal için scrim `rgba(0,0,0,0.5)`.
- **Glow (opsiyonel, çok az):** Aktif/odak vurgusunda hafif `text-shadow: 0 0 10px` — abartma.
- **Focus:** Tüm interaktif elemanlarda görünür focus ringi (`--accent`). `outline:none` bırakıp focus'u yok etme; klavye için görünür tut.
- **Hover/press:** 150–300ms geçiş. `cursor: pointer` tüm tıklanabilirlerde.
- **Press state:** Layout'u kaydırmayan geçiş (opacity/renk), `transform: translate` ile içerik zıplatma.
- **Disabled:** opacity 0.4 + `cursor: not-allowed` + semantik `disabled` attribute.

---

## 6. Animasyon

- Süre: mikro-etkileşim 150–300ms, karmaşık ≤ 400ms, > 500ms yok.
- Sadece `transform` / `opacity` animasyonu. `width/height/top/left` animasyonlama.
- Easing: girişte ease-out, çıkışta ease-in. Çıkış süresi girişin ~%60–70'i.
- Mevcut keyframe'ler: `fadeIn` (giriş), `spin` (loader), `pulse` (canlı/loading durum).
- > 300ms süren yüklemelerde skeleton/shimmer göster, boş eksen/blocking spinner yok.
- `prefers-reduced-motion` her zaman dikkate alınır.

---

## 7. Formlar & Geri Bildirim

- Her input'un **görünür label**'ı olsun (placeholder label yerine geçmez).
- Hata mesajı **ilgili alanın altında** + neden + nasıl düzeltilir ("Geçersiz" yetmez).
- Submit: loading → success/error durumu net göster.
- Doğrulama: keystroke'ta değil, `blur`'da (inline).
- Yıkıcı eylemlerde (delete domain/process kill) onay diyaloğu + `--red` ile vurgulanmış, birincil eylemden ayrı.
- Boş durumlar (empty state): "Henüz X yok" + yönlendirici eylem.
- Toast 3–5sn'de otomatik kapanır, `aria-live="polite"`, focus çalmaz.

---

## 8. İkonlar

- **Emoji kullanma.** SVG ikon seti: Lucide / Heroicons (tek aile, tutarlı stroke ~1.5–2px).
- Tek hiyerarşi seviyesinde filled/outline karıştırma.
- İkon boyutları token'lı: sm 16 · md 20/24 · lg.
- İkon-only butona `aria-label` zorunlu. Tıklama alanı ≥ 44×44 (gerekirse hitSlop/padding).

---

## 9. Navigasyon

- Sidebar = birincil navigasyon; aktif konum görsel vurgulu (renk + weight + indikatör).
- Navigasyon yerleşimi tüm sayfalarda **aynı** kalır.
- Geri/durum koruma: filtre, scroll pozisyonu mümkünse korunur.
- Yıkıcı eylemler (logout, hesap silme) normal nav öğelerinden görsel/uzamsal olarak ayrı.

---

## 10. Grafik & Veri (metrik panelleri için)

- Trend → line, karşılaştırma → bar, oran → ≤5 kategori ise donut, fazlaysa bar.
- Eksen birimli ve okunur; mobilde tick seyrelt.
- Tooltip hover (web) / tap (mobil) ile tam değer.
- Renk tek başına anlam taşımaz → şekil/etiket ekle (renk körü dostu).
- Boş veri → "Veri yok" durumu; yükleniyor → skeleton; hata → retry'li mesaj.
- Grid çizgileri düşük kontrast (`--border` civarı), veriyle yarışmasın.
- Sayısal eksen/etiketlerde tabular figürler.

---

## 11. Anti-patterns (KAÇIN)

- Light mode varsayılanı (bu panel dark-only).
- Emoji'yi ikon olarak kullanmak.
- Focus ringini kaldırmak.
- Durumu sadece renkle anlatmak.
- Rastgele spacing / rastgele gölge değerleri.
- Gövde metninde `--text-muted` (gri-üstüne-gri).
- `width/height` animasyonu, 500ms+ animasyon.
- Yıkıcı eylemi birincil eylemin yanına koymak.

---

## 12. Pre-Delivery Checklist

- [ ] Emoji ikon yok (SVG: Lucide/Heroicons)
- [ ] Tüm tıklanabilirlerde `cursor:pointer` + 150–300ms hover geçişi
- [ ] Görünür focus state (klavye navigasyonu)
- [ ] Gövde metni kontrastı ≥ 4.5:1, ikincil ≥ 3:1
- [ ] Durum hem renk hem ikon/metin ile
- [ ] `prefers-reduced-motion` destekleniyor
- [ ] Responsive: 375 / 768 / 1024 / 1440 test edildi
- [ ] Touch hedefleri ≥ 44px
- [ ] Form: label + alan-altı hata + submit feedback
- [ ] Yıkıcı eylemde onay + ayrı yerleşim

---

### Opsiyonel alternatif yön (şu an uygulanmıyor)
ui-ux-pro-max skill'i daha "soğuk" bir palet öneriyor: slate zemin (`#020617`/`#0F172A`), yeşil accent (`#22C55E`), Fira Code/Fira Sans. Marka tercihini netleştirirsen mevcut nötr-gri + mavi yerine bu yöne geçebiliriz; ikisi de dark-technical kategorisinde tutarlı.
