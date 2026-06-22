# DB Explorer — Yapı / DDL Düzenleme (Alt-proje 2) Tasarım

> DBeaver-tarzı DB Explorer yükseltmesinin 2. alt-projesi. Sıra: 1) Grid & Sorgu v2 ✅ → **2) Yapı/DDL** → 3) ER diyagramı.
> Kapsam (onaylı): pg+mysql; harici DB **salt-okunur kapısı korunur**; yıkıcı DDL **onay** gerektirir.
> Kullanıcı uzakta, açık yetki verdi — tasarım forkları sensible default'larla bu spec'te çözüldü.

## Amaç
Editöre **"Yapı" sekmesi** ekle: bir tablonun kolonlarını listele ve DBeaver gibi **kolon ekle / yeniden adlandır / sil / tip+nullable değiştir** (ALTER TABLE). Mevcut güvenlik modeliyle (harici salt-okunur + yıkıcı onay) tutarlı.

## Mimari
- **Backend:** `lib/server/dbExplorer/postgres.ts` & `mysql.ts` — `tableStructure()` + saf DDL builder'ları (export'lu, test edilebilir). Saf doğrulayıcılar `types.ts`'te: `validateColumnType` (tip allowlist) + `validateIdentifier` (yeni ad deseni).
- **Route:** Yeni `app/api/dbx/[ref]/ddl/route.ts` (POST) — sql route'un kapı desenini birebir izler: requireAuth → 404/engine → harici salt-okunur (`?write=1`) → yıkıcı (`?confirm=1` yoksa `{blocked:true,destructive,reason}`) → doğrula → adapter builder → `runSql`.
- **Client:** `app/(panel)/databases/[ref]/page.tsx` — `ActiveTab` 'structure' eklenir. Yeni `components/dbexplorer/StructureTab.tsx` — kolon tablosu + ekle/yeniden-adlandır/sil/tip-düzenle, `ConfirmDestructive` ile yıkıcı onay. `lib/api-client.ts` — `dbxStructure` + `dbxDdl`.

## Davranış

### Yapı sekmesi (yalnız postgres+mysql; redis'te sekme yok)
- Tablo seçiliyken "Yapı" sekmesi kolonları tabloda gösterir: **ad · tip · nullable (✓/✗) · default · PK**.
- **Kolon ekle:** ad + tip (dropdown: ortak tipler) + opsiyonel uzunluk/precision + nullable checkbox + opsiyonel default. → `ALTER TABLE ADD COLUMN`.
- **Yeniden adlandır:** satırdaki kalem → yeni ad input. pg: `RENAME COLUMN old TO new`; mysql: `CHANGE COLUMN old new <mevcut_tip>` (mysql rename tipi gerektirir → `tableStructure`'dan alınır).
- **Tip/nullable değiştir:** satırda tip-düzenle → yeni tip + nullable. pg: `ALTER COLUMN col TYPE t` (+ ayrı `SET/DROP NOT NULL`); mysql: `MODIFY COLUMN col <tip> [NOT NULL|NULL]`. **Yıkıcı say** (veri kaybı/dönüşüm riski) → onay.
- **Kolon sil:** satırda çöp → `DROP COLUMN`. **Yıkıcı** → onay.
- Aksiyonlardan sonra `tableStructure` + grid yeniden yüklenir (yapı değişti).
- Harici DB veya salt-okunur (canWrite=false) → yazma aksiyonları gizli/disabled; yalnız görüntüleme.

### Tip güvenliği (KİLİT)
- Kolon tipleri SQL'e **escape edilemez** (literal değil) → `validateColumnType(raw, engine)` saf fonksiyonu **allowlist** uygular:
  - Temel tip (büyük/küçük harf duyarsız) bir izinli kümede olmalı. Ortak: `text, varchar, char, integer, int, bigint, smallint, boolean, numeric, decimal, real, date, timestamp, time, json`. pg-ek: `timestamptz, uuid, jsonb, double precision, serial, bigserial`. mysql-ek: `tinyint, datetime, double, float`.
  - Opsiyonel `(n)` veya `(p,s)` soneki — yalnız rakam/virgül. Başka karakter (`;`, boşluk-sonrası-kelime, tırnak) → **reddedilir** (400). Normalize edilmiş güvenli tip string döner.
- Identifier'lar (kolon/tablo/şema) `pgIdent`/`myIdent` ile escape edilir. **Yeni** adlar (ekle/yeniden-adlandır hedefi) ayrıca `validateIdentifier`: `^[A-Za-z_][A-Za-z0-9_]*$` (≤63 karakter) — desen dışı reddedilir. **Mevcut** ad referansları (sil/rename kaynağı/alter hedefi) gerçek `tableStructure` kolon listesine karşı doğrulanır.

## Veri akışı
StructureTab `tableStructure` çağırır → `ColumnDef[]` render. Aksiyon → `dbxDdl(ref, {db,schema,table,op,...}, {write,confirm})`. Yıkıcı op + `confirm` yoksa route `{blocked:true,reason}` döner → ConfirmDestructive aç → onayla → `confirm:true` ile tekrar. Başarı → `tableStructure` reload + parent'a "yapı değişti" sinyali (grid'i tazele).

## Hata yönetimi
- Geçersiz tip → 400 "Geçersiz/izinsiz kolon tipi". Geçersiz yeni ad → 400. SQL hatası (ör. tip dönüşümü başarısız) → 500 + mesaj toast.
- Harici salt-okunur write denemesi → 403 (mevcut mesaj). Yıkıcı → `{blocked:true}` (200), UI onay modalı.

## Güvenlik
- Yalnız pg+mysql. Harici DB salt-okunur kapısı **değişmez** (`?write=1`). Yıkıcı (drop/alter-type) **`?confirm=1`**. Tipler allowlist, identifier'lar escape + yeni-ad deseni. requireAuth. SQL tek argv `docker exec` (shell yok). Admin zaten docker erişimine sahip → yeni yetki açmaz.

## Test
- **Unit (node:test):** `validateColumnType` (allowlist geçer; `text; DROP`/`varchar(1);x`/bilinmeyen tip reddedilir; `varchar(255)`/`numeric(10,2)` geçer; pg/mysql farkı). `validateIdentifier` (geçerli/geçersiz). Builder'lar (pg+mysql): `buildAddColumn/DropColumn/RenameColumn/AlterColumnType` doğru DDL + ident escape üretir.
- **e2e:** Yapı sekmesi bağlantı varsa görünür + kolon tablosu render (Task-6 deseni gibi guard'lı; CI'da DB yoksa no-op).
- **Canlı (zolvix-postgres-1, salt-okunur):** Yapı sekmesi kolonları gösterir (görüntüleme). **ALTER denenmez** (prod). Yazma/DDL yolu unit testlerle kanıtlanır.

## Dosya yapısı
- `lib/server/dbExplorer/types.ts` — `ColumnDef {name,type,nullable,default,isPk}`, `DdlOp`, `validateColumnType`, `validateIdentifier`.
- `lib/server/dbExplorer/postgres.ts` & `mysql.ts` — `tableStructure` + 4 builder.
- `app/api/dbx/[ref]/ddl/route.ts` — yeni POST route.
- `lib/api-client.ts` — `dbxStructure`, `dbxDdl`.
- `app/(panel)/databases/[ref]/page.tsx` — 'structure' sekmesi.
- `components/dbexplorer/StructureTab.tsx` — yeni bileşen.
- `messages/*.json` (6 dil) — yeni `dbx` anahtarları (structure, addColumn, columnName, columnType, nullable, default, dropColumn, renameColumn, changeType vs.).
- `lib/server/dbExplorer/ddl.test.ts` — yeni unit testler.
- `e2e/dbexplorer.spec.ts` — Yapı sekmesi guard'lı assert.

## Kapsam dışı (YAGNI / sonraki)
- Index ekle/sil, foreign key, constraint, tablo yeniden adlandır/oluştur/sil, partition.
- Çoklu kolon aynı anda; kolon yeniden sıralama; yorum (COMMENT).
- ER diyagramı → Alt-proje 3.
- MySQL sürüm-bağımlı rename: `CHANGE COLUMN` kullanılır (geniş uyumlu).
