# VPS Panel

Caddy + PM2 tabanlı, kendi VDS'ini tarayıcıdan yönetmek için minimal panel.

## Özellikler

- **Dashboard** — CPU, RAM, disk, Caddy durumu gerçek zamanlı
- **Domains** — Domain ekle/sil/düzenle, reverse proxy veya static site, otomatik SSL, alias desteği, otomatik port atama
- **Processes** — PM2 process listesi, başlat/durdur/restart, log görüntüleme
- **Logs** — Sistem ve domain bazlı loglar, filtrele, gerçek zamanlı
- **Settings** — Şifre değiştir, Caddyfile görüntüle, sistem bilgisi

---

## Kurulum (VDS'e)

### 1. Projeyi VDS'e kopyala

```bash
scp -r vps-panel/ root@VDS_IP:/tmp/
ssh root@VDS_IP
cd /tmp/vps-panel
```

### 2. Kurulum scriptini çalıştır

```bash
chmod +x install.sh
sudo ./install.sh
```

Script şunları yapar:
- Node.js 20, PM2, Caddy kurar
- Panel'i `/opt/vps-panel` dizinine kurar
- Backend'i PM2 ile başlatır
- Caddy'yi systemd servisi olarak başlatır

### 3. Panele eriş

```
http://VDS_IP:3999
```

Varsayılan giriş: `admin` / `admin123`

> ⚠️ İlk girişten sonra Settings sayfasından şifrenizi değiştirin!

---

## Panel'i HTTPS ile Yayınlama (Önerilen)

Panel'i `panel.sitenindomaini.com` adresiyle SSL'li açmak için:

1. Domain'in DNS kaydını VDS IP'sine yönlendirin
2. Caddyfile'a ekleyin:

```
panel.sitenindomaini.com {
    reverse_proxy localhost:3999
    basicauth {
        admin $2a$14$... # bcrypt hash
    }
}
```

Ya da panele domain ekleyip aynı şeyi arayüzden yapın.

---

## Manuel Komutlar

```bash
# Panel durumu
pm2 status

# Panel logları
pm2 logs vps-panel

# Panel restart
pm2 restart vps-panel

# Caddy durumu
systemctl status caddy

# Caddy reload
caddy reload --config /etc/caddy/Caddyfile
```

---

## Proje Yapısı

```
vps-panel/
├── backend/
│   ├── index.js              # Express sunucu
│   ├── routes/
│   │   ├── auth.js           # Login, JWT
│   │   ├── domains.js        # Domain CRUD
│   │   ├── processes.js      # PM2 yönetimi
│   │   └── system.js         # Metrikler, loglar
│   ├── services/
│   │   ├── caddy.js          # Caddyfile yönetimi
│   │   ├── pm2.js            # PM2 wrapper
│   │   └── portManager.js    # Otomatik port bulma
│   └── db/
│       └── database.js       # NeDB veritabanı
└── frontend/
    └── src/
        ├── App.jsx            # Ana layout, routing
        ├── api.js             # API helper
        ├── pages/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   ├── Domains.jsx
        │   ├── Processes.jsx
        │   ├── Logs.jsx
        │   └── Settings.jsx
        └── components/
            └── ui.jsx         # Ortak bileşenler
```

---

## Çevre Değişkenleri

Backend için `.env` dosyası oluşturabilirsiniz:

```env
PORT=3999
JWT_SECRET=guclu-bir-secret-girin
CADDYFILE_PATH=/etc/caddy/Caddyfile
NODE_ENV=production
```
