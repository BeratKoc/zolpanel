const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const { authenticateToken } = require('./auth');
const { db } = require('../db/database');
const { isCaddyRunning, reloadCaddy, readCaddyfile } = require('../services/caddy');
const { getMemoryStats, getCurrentServices } = require('../services/memoryTracker');

// Sistem metrikleri
router.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

    const mainDisk = disk.find(d => d.mount === '/') || disk[0];
    const caddyRunning = await isCaddyRunning();

    res.json({
      cpu: {
        load: Math.round(cpu.currentLoad),
        cores: cpu.cpus?.length || 1,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        active: mem.active,
        free: mem.free,
        percent: Math.round((mem.used / mem.total) * 100),
        activePercent: Math.round((mem.active / mem.total) * 100),
      },
      disk: mainDisk ? {
        total: mainDisk.size,
        used: mainDisk.used,
        free: mainDisk.available,
        percent: Math.round(mainDisk.use),
      } : null,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        hostname: osInfo.hostname,
      },
      caddy: {
        running: caddyRunning,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: 'Metrikler alınamadı', detail: e.message });
  }
});

// Logları listele
router.get('/logs', authenticateToken, (req, res) => {
  const { domain, level, limit = 200 } = req.query;
  const query = {};
  if (domain && domain !== 'all') query.domain = domain;
  if (level && level !== 'all') query.level = level;

  db.logs
    .find(query)
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .exec((err, logs) => {
      if (err) return res.status(500).json({ error: 'Loglar alınamadı' });
      res.json(logs);
    });
});

// Logları temizle
router.delete('/logs', authenticateToken, (req, res) => {
  const { domain } = req.query;
  const query = domain && domain !== 'all' ? { domain } : {};
  db.logs.remove(query, { multi: true }, (err, count) => {
    if (err) return res.status(500).json({ error: 'Loglar temizlenemedi' });
    res.json({ message: `${count} log silindi` });
  });
});

// Caddy reload
router.post('/caddy/reload', authenticateToken, async (req, res) => {
  try {
    await reloadCaddy();
    res.json({ message: 'Caddy yeniden yüklendi' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Caddyfile içeriğini getir
router.get('/caddy/config', authenticateToken, (req, res) => {
  try {
    const content = readCaddyfile();
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Caddyfile okunamadı' });
  }
});

// Genel istatistikler (dashboard için)
router.get('/stats', authenticateToken, (req, res) => {
  db.domains.find({}, (err, domains) => {
    if (err) return res.status(500).json({ error: 'İstatistikler alınamadı' });

    const stats = {
      total: domains.length,
      active: domains.filter(d => d.status === 'active').length,
      offline: domains.filter(d => d.status === 'offline').length,
      proxy: domains.filter(d => d.type === 'proxy').length,
      static: domains.filter(d => d.type === 'static').length,
      sslActive: domains.filter(d => d.sslStatus === 'active').length,
    };
    res.json(stats);
  });
});

module.exports = router;

// Servis bazlı memory stats (sparkline + anomali)
router.get('/memory-stats', authenticateToken, async (req, res) => {
  const hours = parseInt(req.query.hours) || 1;
  try {
    const stats = await getMemoryStats(hours);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: 'Memory stats alınamadı', detail: e.message });
  }
});

// Anlık servis listesi
router.get('/services', authenticateToken, async (req, res) => {
  try {
    const services = await getCurrentServices();
    res.json(services);
  } catch (e) {
    res.status(500).json({ error: 'Servis listesi alınamadı', detail: e.message });
  }
});
