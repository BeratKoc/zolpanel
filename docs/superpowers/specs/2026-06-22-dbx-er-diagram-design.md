# DB Explorer — ER Diyagramı (Alt-proje 3) Tasarım

> DBeaver-tarzı DB Explorer yükseltmesinin 3. (son) alt-projesi. Sıra: 1) Grid & Sorgu v2 ✅ → 2) Yapı/DDL ✅ → **3) ER diyagramı**.
> Kapsam: pg+mysql, **salt-okunur** (DB'yi değiştirmez). Kullanıcı uzakta, açık yetki — forklar bu spec'te çözüldü.

## Amaç
Bir veritabanının **tablolarını ve foreign-key ilişkilerini görsel bir ER diyagramında** göster — tablo kutuları (kolon listesi, PK/FK işaretli) + tablolar arası FK kenarları. Bağımlılık eklemeden (saf SVG), salt-okunur.

## Mimari
- **Backend:** `postgres.ts` & `mysql.ts` adapter'larına `erModel(ref, db, schema)` — 3 salt-okunur `information_schema` sorgusu (tüm kolonlar + PK seti + FK kenarları) çalıştırıp `{ tables, edges }` döndürür. Şema/db değerleri `pgLiteral`/`myLiteral` ile escape (dinamik identifier yok — yalnız WHERE'de literal). Saf `computeErLayout(tables, edges)` (deterministik grid yerleşimi) `types.ts`'te — **test edilebilir çekirdek**.
- **Route:** Yeni `app/api/dbx/[ref]/er/route.ts` (GET) — requireAuth → engine!=redis → `adapter.erModel(ref, db, schema)` → `{ tables, edges }`. Yazma yok (salt-okunur) → harici DB'de de serbest.
- **Client:** Yeni `components/dbexplorer/ErDiagram.tsx` — `dbxEr` çağırır, `computeErLayout` ile yerleşim hesaplar, **SVG** render eder (kutular + kenarlar), scrollable. Editör header'ında "ER Diyagramı" butonu → `Modal` içinde ErDiagram. `lib/api-client.ts` — `dbxEr`.

## Davranış

### ER butonu + modal
- Editör header'ında (`databases/[ref]/page.tsx`) salt-okunur switch'in yanında **"ER Diyagramı"** butonu (yalnız postgres+mysql; redis'te yok).
- **Tablo seçiliyse aktif** (db'yi `selected.db`'den alır); seçili değilse disabled + title "Önce bir tablo seçin". (Tasarım sınırı: ER db-bazlı; db'yi bilmek için bir tablo seçilir — kullanıcı zaten tabloya tıklar.)
- Tıklayınca geniş `Modal` (width ~900) açılır; içinde scrollable SVG diyagram.

### Diyagram içeriği
- Her tablo bir **kutu**: başlık (tablo adı) + kolon satırları. PK kolonu vurgulu (anahtar/`accent`), FK kolonu işaretli (ikon/renk).
- FK ilişkileri: kaynak tablo kutusundan hedef tablo kutusuna **bezier `<path>`** kenar (`--border-light`/`--accent`), basit ok/uç.
- **Yerleşim:** `computeErLayout` deterministik **grid** — `cols = ceil(sqrt(n))`, sabit kutu genişliği, yükseklik = başlık + kolon-sayısı*satır-yüksekliği, sabit boşluk. Çakışma yok. SVG boyutu layout genişlik/yüksekliğine eşit; konteyner `overflow:auto`.
- **Boş durum:** tablo yoksa "Tablo yok"; FK yoksa tablolar yine çizilir + "İlişki (FK) yok" notu. Yüklenirken spinner.
- v1: sürükleme/yeniden konumlama, zoom, export YOK (YAGNI).

## Veri akışı
ErDiagram mount → `api.dbxEr(connRef, db, schema)` → `{ tables: ErTable[], edges: ErEdge[] }` → `computeErLayout(tables, edges)` → `{ nodes: ErNode[], width, height }` → SVG render. Modal kapanınca bileşen unmount.

## Tipler
- `ErColumn { name: string; isPk: boolean; isFk: boolean }`
- `ErTable { name: string; columns: ErColumn[] }`
- `ErEdge { fromTable: string; fromCol: string; toTable: string; toCol: string }`
- `ErNode { name: string; x: number; y: number; w: number; h: number; columns: ErColumn[] }`
- `ErModel { tables: ErTable[]; edges: ErEdge[] }`; `ErLayout { nodes: ErNode[]; width: number; height: number }`

## SQL (salt-okunur, schema/db literal-escape)
- **pg kolonlar:** `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=<lit> ORDER BY table_name, ordinal_position`.
- **pg PK:** table_constraints (PRIMARY KEY) ⋈ key_column_usage, schema filtreli → {table.col} seti.
- **pg FK:** table_constraints (FOREIGN KEY) ⋈ key_column_usage (kaynak) ⋈ constraint_column_usage (hedef), schema filtreli.
- **mysql kolonlar:** information_schema.columns WHERE table_schema=<db>.
- **mysql PK:** key_column_usage WHERE table_schema=<db> AND constraint_name='PRIMARY'.
- **mysql FK:** key_column_usage WHERE table_schema=<db> AND referenced_table_name IS NOT NULL (from/to).
- `erModel` bu sorguları çalıştırıp JS'te birleştirir (kolonlara isPk/isFk işaretler).

## Hata yönetimi
- SQL/bağlantı hatası → ErDiagram içinde hata mesajı + retry değil (modal kapat/aç). Boş veri → boş durum.
- redis → route 400 (ER yok).

## Güvenlik
- Tamamen salt-okunur (yalnız SELECT). Dinamik identifier YOK — yalnız schema/db değerleri WHERE'de literal-escape. requireAuth. SQL tek argv `docker exec`. Admin zaten docker erişimine sahip → yeni yetki açmaz.

## Test
- **Unit (node:test):** `computeErLayout` — N tablo için deterministik konumlar, kutu boyutu kolon sayısıyla orantılı, grid çakışmasız, nodes tablo sayısına eşit, width/height pozitif; boş girişte boş layout. (Saf fonksiyon — esas otomatik kapsam.)
- **e2e:** "ER Diyagramı" butonu bağlantı+tablo varsa görünür + tıklayınca modal açılır (Task-6 deseni gibi guard'lı; CI'da DB yoksa no-op).
- **Canlı (zolvix-postgres-1, salt-okunur):** ER butonu → modal → tablolar (15) + varsa FK kenarları çizilir. Salt-okunur (DB değişmez).

## Dosya yapısı
- `lib/server/dbExplorer/types.ts` — ER tipleri + `computeErLayout`.
- `lib/server/dbExplorer/postgres.ts` & `mysql.ts` — `erModel`.
- `app/api/dbx/[ref]/er/route.ts` — GET.
- `lib/api-client.ts` — `dbxEr`.
- `app/(panel)/databases/[ref]/page.tsx` — header "ER Diyagramı" butonu + modal state.
- `components/dbexplorer/ErDiagram.tsx` — SVG diyagram.
- `messages/*.json` (6 dil) — `erDiagram`, `erEmpty`, `erNoFk`, `erColumns`.
- `lib/server/dbExplorer/erLayout.test.ts` — `computeErLayout` testleri.
- `e2e/dbexplorer.spec.ts` — ER butonu guard'lı assert.

## Kapsam dışı (YAGNI)
- Sürükle-bırak konumlama, zoom/pan, otomatik kuvvet-yönlü layout, diyagram export (PNG/SVG indir), kardinalite gösterimi (1:N işaretleri), self-referencing FK özel çizimi (basit kenar yeterli), tablo arama/filtre. v1 statik grid + bezier kenar.
