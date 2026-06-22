# DB Explorer — Grid & Sorgu v2 (Alt-proje 1) Tasarım

> Bu, DBeaver-tarzı DB Explorer'ı güçlendiren 3 alt-projenin **ilkidir**.
> Sıra (onaylı): **1) Grid & Sorgu v2 → 2) Yapı/DDL → 3) ER diyagramı**. Her biri kendi spec+plan+SDD döngüsü.
> Kapsam kararı (onaylı): pg+mysql; harici (panel-dışı) DB'lerde **salt-okunur kapısı korunur**; yazma `?write=1` + yıkıcıda onay.

## Amaç
Editör grid'inin **kötü izlenim veren yükleme deneyimini** düzelt (spinner-flash → skeleton + eski-veriyi-koru) ve gerçek bir DBeaver hissi ver: **hücre seçim/düzenleme modeli**, **kolon başlığından sıralama** ve **kolon-bazlı filtre**. Yeni route yok; mevcut `rows` endpoint + adapter'lar genişletilir.

## Mimari
- **Backend:** `lib/server/dbExplorer/postgres.ts` & `mysql.ts` — yeni `columns()` metodu + saf `buildOrderBy`/`buildWhere` yardımcıları (test edilebilir, export'lu); `getRows` opsiyonları `{ limit, offset, orderBy?, orderDir?, filters? }`'e genişler. Kolon adları **gerçek kolon listesine karşı doğrulanır** (identifier injection yok); değerler mevcut `pgLiteral`/`myLiteral` ile escape edilir.
- **Route:** `app/api/dbx/[ref]/rows/route.ts` GET — `orderBy`, `orderDir`, `filters` (JSON-string query param) okur, adapter'a iletir. Yazma yok (sort/filter = okuma) → harici DB'de de serbest.
- **Client:** `components/dbexplorer/DataGrid.tsx` — yükleme UX'i, seçim/düzenleme modeli, sıralama göstergesi, filtre satırı. `app/globals.css` — skeleton shimmer + ince progress-bar keyframe (mevcut `pulse`/`spin` yanına). `lib/api-client.ts` — `dbxRows` imzası genişler; `dbxRowUpdate` `null` değer geçişi.

## Davranış

### 1) Yükleme UX (A) — kötü izlenimi gideren kısım
- **İlk açılış (veri yok):** merkezî spinner yerine **skeleton tablo** — başlık satırı + ~8 shimmer satır (`@keyframes shimmer`, `prefers-reduced-motion`'da statik).
- **Yeniden çekme (sayfalama/sıralama/filtre/edit sonrası):** mevcut satırlar **ekranda kalır**; grid `opacity: 0.55 + pointer-events:none`, toolbar altında **2px belirsiz progress çubuğu** (`--accent`). İçerik kaybolmaz, spinner-flash yok.
- Mevcut sürekli dönen mini spinner (DataGrid ~satır 259) kaldırılır. `if (loading && !data)` merkezî spinner → skeleton ile değişir.

### 2) Hücre seçim + düzenleme (B) — DBeaver modeli
- **Tek tık = hücre seç** (accent çerçeve, `selectedCell {row,col}`). **Çift-tık / F2 / Enter / yazmaya başla = düzenle.**
- Düzenlemede: **Esc** iptal, **Enter** kaydet+alta geç, **Tab** kaydet+sağa geç. Seçiliyken **ok tuşları** hücre gezinir (kenarda durur).
- **Ctrl+C** seçili hücrenin ham değerini panoya kopyalar.
- **Delete / Ctrl+Shift+N → NULL ata.** Backend `buildUpdate` zaten `null`→`NULL` üretiyor (tip `string | null`); client JSON `null` gönderir (boş string `''` ≠ NULL korunur). NULL hücre italik "NULL" görünür.
- Düzenleme hâlâ **PK gerektirir** (mevcut kısıt); "PK yok" rozeti korunur. Salt-okunur/harici-DB'de seçim çalışır ama düzenleme kapalı.
- Not (kapsam dışı, mevcut sınır): MySQL `--batch --raw` çıktısı NULL ile string "NULL"u ayırt edemez (TSV); MySQL'de NULL **görüntü** ayrımı v2'de iyileştirilmez — yalnız yazma yolu NULL üretir.

### 3) Sıralama + filtre (D)
- **Kolon başlığına tık:** yok → ASC → DESC → yok döngüsü; başlıkta ▲/▼ göstergesi. **Tek aktif sıralama kolonu.**
- **"Filtre" düğmesi** başlık altında filtre satırı açar; her kolona küçük input (350ms debounce).
  - Operatör input önekinden: `=` (eşit), `!=` (değil), `>`, `<`, `>=`, `<=`; önek yoksa **içerir** (pg `ILIKE '%v%'`, mysql `LIKE '%v%'`).
  - Çoklu kolon filtresi **AND**'lenir. Boş input → o kolon filtresiz.
- Sıralama/filtre değişince **offset 0'lanır**.
- Backend doğrulama: `orderBy` ve her `filter.col` **gerçek kolon listesinde olmalı** (yoksa yok sayılır/400); `op` allowlist; değer `pgLiteral`/`myLiteral` ile escape.

## Veri akışı
DataGrid state'i ekler: `sort: {col,dir} | null`, `filters: Record<col,string>` (ham input), `selectedCell: {row,col} | null`. `fetchRows` bunları parse edip (`filters` → `{col,op,value}[]`) endpoint'e gönderir. Filtre input'u debounce'lu. Hata → toast, **eski veri korunur**.

## Hata yönetimi
- Geçersiz filtre değeri / SQL hatası → toast; grid eski veriyi gösterir (dim kalkar).
- Bilinmeyen kolon (orderBy/filter) → route 400 veya sessiz yok sayma (plan netleştirir: **400 + toast**, ama UI yalnız gerçek kolonlardan üretildiği için normalde oluşmaz).
- Kolon-adı injection denemesi (ör. `id; DROP`) → doğrulama reddeder (kolon listesinde yok).

## Güvenlik
- Kolon adları gerçek kolon listesine karşı doğrulanır (raw identifier injection yok); değerler mevcut literal-escape helper'larıyla escape.
- Harici DB salt-okunur kapısı **değişmez**: sort/filter okuma → serbest; hücre edit/NULL/sil hâlâ `?write=1` + harici'de "düzenlemeyi etkinleştir" gerekir.
- SQL tek argv ile `docker exec` (shell yok) — mevcut model korunur.

## Test
- **Unit (node:test):** `buildOrderBy`/`buildWhere` (pg+mysql) doğru SQL + escaping üretir; geçersiz kolon reddedilir; operatör allowlist; NULL `buildUpdate` yolu. Mevcut `lib/i18n.test.ts` parity (yeni i18n anahtarları 6 dilde).
- **e2e (Playwright):** editör tablo → başlığa tıkla (sıra değişir), filtre (satır azalır), çift-tık hücre düzenle+kaydet, NULL ata, yükleme sırasında boş-flash yok (eski satırlar görünür kalır). Mobil 360px taşma yok. Canlı zolvix-postgres-1'de **salt-okunur** doğrulama (yazma denenmez).

## Dosya yapısı
- `lib/server/dbExplorer/postgres.ts` — `columns()`, `buildOrderBy`, `buildWhere`, `getRows` genişler.
- `lib/server/dbExplorer/mysql.ts` — aynısı (mysql ident/literal ile).
- `lib/server/dbExplorer/types.ts` — `FilterCond {col,op,value}`, `GetRowsOpts` tipleri.
- `app/api/dbx/[ref]/rows/route.ts` — GET orderBy/orderDir/filters okur.
- `lib/api-client.ts` — `dbxRows` opts genişler; `dbxRowUpdate` `null` değer.
- `components/dbexplorer/DataGrid.tsx` — yükleme/seçim/düzenleme/sıralama/filtre.
- `app/globals.css` — `@keyframes shimmer` + skeleton/progress sınıfları.
- `messages/*.json` (6 dil) — yeni dbx anahtarları (filtre, sırala, NULL, kopyala, skeleton vs.).
- `e2e/dbexplorer.spec.ts` (veya yeni) — sort/filter/edit/null/loading testleri.

## Kapsam dışı (sonraki alt-projeler / YAGNI)
- Tablo yapısı/DDL düzenleme → Alt-proje 2.
- ER diyagramı → Alt-proje 3.
- Çoklu-kolon sıralama, kaydedilmiş filtreler, kolon gizle/yeniden sırala, hücre içi tür-editörü (tarih seçici vb.) — v2'de yok.
- MySQL NULL görüntü ayrımı (yukarıda not edildi).
