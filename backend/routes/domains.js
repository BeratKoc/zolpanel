const express = require('express');
const router = express.Router();
const { db, addLog } = require('../db/database');
const { authenticateToken } = require('./auth');
const { addDomainToConfig, removeDomainFromConfig, isCaddyRunning } = require('../services/caddy');
const { findNextAvailablePort } = require('../services/portManager');

// Tüm domainleri listele
router.get('/', authenticateToken, (req, res) => {
  db.domains.find({}).sort({ createdAt: -1 }).exec((err, domains) => {
    if (err) return res.status(500).json({ error: 'Domainler listelenemedi' });
    res.json(domains);
  });
});

// Tek domain getir
router.get('/:id', authenticateToken, (req, res) => {
  db.domains.findOne({ _id: req.params.id }, (err, domain) => {
    if (err || !domain) return res.status(404).json({ error: 'Domain bulunamadı' });
    res.json(domain);
  });
});

// Yeni domain ekle
router.post('/', authenticateToken, async (req, res) => {
  const { domain, type, port, rootPath, aliases, appType, notes, routes } = req.body;

  if (!domain) return res.status(400).json({ error: 'Domain adı gerekli' });
  if (!type || !['proxy', 'static', 'advanced'].includes(type)) {
    return res.status(400).json({ error: 'Geçerli tip: proxy, static veya advanced' });
  }
  if (type === 'proxy' && !port && port !== 0) {
    return res.status(400).json({ error: 'Proxy tipi için port gerekli' });
  }
  if (type === 'advanced' && (!routes || routes.length === 0)) {
    return res.status(400).json({ error: 'Advanced tip için en az bir route gerekli' });
  }

  db.domains.findOne({ domain }, async (err, existing) => {
    if (existing) return res.status(409).json({ error: 'Bu domain zaten mevcut' });

    let assignedPort = port;

    if (type === 'proxy' && !assignedPort) {
      db.domains.find({ type: 'proxy' }, async (err2, proxies) => {
        const reservedPorts = proxies.map(p => p.port).filter(Boolean);
        try {
          assignedPort = await findNextAvailablePort(reservedPorts);
          await saveDomain();
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      });
      return;
    }

    await saveDomain();

    async function saveDomain() {
      if (type === 'proxy') {
        db.domains.findOne({ port: assignedPort }, async (err3, existingPort) => {
          if (existingPort) {
            return res.status(409).json({ error: `Port ${assignedPort} zaten kullanımda` });
          }
          await createDomain();
        });
        return;
      }
      await createDomain();

      async function createDomain() {
        const newDomain = {
          domain,
          type,
          port: type === 'proxy' ? assignedPort : null,
          rootPath: type === 'static' ? (rootPath || `/var/www/${domain}`) : null,
          routes: type === 'advanced' ? routes : null,
          aliases: aliases || [],
          appType: appType || 'other',
          notes: notes || '',
          status: 'active',
          sslStatus: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        db.domains.insert(newDomain, async (insertErr, doc) => {
          if (insertErr) return res.status(500).json({ error: 'Domain kaydedilemedi' });

          try {
            const caddyRunning = await isCaddyRunning();
            if (caddyRunning) {
              await addDomainToConfig(newDomain);
              setTimeout(() => {
                db.domains.update({ _id: doc._id }, { $set: { sslStatus: 'active' } }, {});
              }, 10000);
            } else {
              addLog(domain, 'warn', 'Caddy çalışmıyor, reload yapılamadı');
            }
          } catch (caddyErr) {
            addLog(domain, 'error', 'Caddy config hatası: ' + caddyErr.message);
          }

          addLog(domain, 'info', `Domain oluşturuldu (${type})`);
          res.status(201).json(doc);
        });
      }
    }
  });
});

// Domain güncelle
router.put('/:id', authenticateToken, async (req, res) => {
  const { notes, aliases, status, appType } = req.body;

  db.domains.findOne({ _id: req.params.id }, async (err, domain) => {
    if (err || !domain) return res.status(404).json({ error: 'Domain bulunamadı' });

    const updates = { updatedAt: new Date().toISOString() };
    if (notes !== undefined) updates.notes = notes;
    if (aliases !== undefined) updates.aliases = aliases;
    if (status !== undefined) updates.status = status;
    if (appType !== undefined) updates.appType = appType;

    db.domains.update({ _id: req.params.id }, { $set: updates }, {}, async (updateErr) => {
    if (updateErr) return res.status(500).json({ error: 'Domain güncellenemedi' });
    
    // Status değiştiyse Caddyfile'ı güncelle
    if (status !== undefined) {
        try {
            const { addDomainToConfig, removeDomainFromConfig, isCaddyRunning } = require('../services/caddy');
            const caddyRunning = await isCaddyRunning();
            if (caddyRunning) {
                if (status === 'offline') {
                    await removeDomainFromConfig(domain.domain);
                } else {
                    await addDomainToConfig({ ...domain, ...updates });
                }
            }
        } catch (e) {
            addLog(domain.domain, 'error', 'Caddy güncelleme hatası: ' + e.message);
        }
    }
    
    addLog(domain.domain, 'info', 'Domain güncellendi');
    res.json({ ...domain, ...updates });
});
  });
});

// Domain sil
router.delete('/:id', authenticateToken, async (req, res) => {
  db.domains.findOne({ _id: req.params.id }, async (err, domain) => {
    if (err || !domain) return res.status(404).json({ error: 'Domain bulunamadı' });

    db.domains.remove({ _id: req.params.id }, {}, async (removeErr) => {
      if (removeErr) return res.status(500).json({ error: 'Domain silinemedi' });

      try {
        const caddyRunning = await isCaddyRunning();
        if (caddyRunning) {
          await removeDomainFromConfig(domain.domain);
        }
      } catch (caddyErr) {
        addLog(domain.domain, 'error', 'Caddy config kaldırma hatası: ' + caddyErr.message);
      }

      addLog(domain.domain, 'info', 'Domain silindi');
      res.json({ message: 'Domain silindi' });
    });
  });
});

// Boş port bul
router.get('/utils/next-port', authenticateToken, (req, res) => {
  db.domains.find({ type: 'proxy' }, async (err, proxies) => {
    const reservedPorts = proxies.map(p => p.port).filter(Boolean);
    try {
      const port = await findNextAvailablePort(reservedPorts);
      res.json({ port });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

module.exports = router;
