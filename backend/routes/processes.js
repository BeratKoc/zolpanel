const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth');
const { listProcesses, startProcess, stopProcess, restartProcess, deleteProcess, getProcessLogs, isPm2Available } = require('../services/pm2');
const { addLog } = require('../db/database');

// Tüm processleri listele
router.get('/', authenticateToken, async (req, res) => {
  try {
    const available = await isPm2Available();
    if (!available) {
      return res.json({ available: false, processes: [] });
    }
    const processes = await listProcesses();
    res.json({ available: true, processes });
  } catch (e) {
    res.status(500).json({ error: 'Process listesi alınamadı', detail: e.message });
  }
});

// Process başlat
router.post('/start', authenticateToken, async (req, res) => {
  const { name, script, cwd } = req.body;
  if (!name || !script) return res.status(400).json({ error: 'name ve script gerekli' });

  try {
    await startProcess(name, script, cwd || '/var/www');
    res.json({ message: `${name} başlatıldı` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Process durdur
router.post('/:name/stop', authenticateToken, async (req, res) => {
  try {
    await stopProcess(req.params.name);
    res.json({ message: `${req.params.name} durduruldu` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Process yeniden başlat
router.post('/:name/restart', authenticateToken, async (req, res) => {
  try {
    await restartProcess(req.params.name);
    res.json({ message: `${req.params.name} yeniden başlatıldı` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Process sil
router.delete('/:name', authenticateToken, async (req, res) => {
  try {
    await deleteProcess(req.params.name);
    res.json({ message: `${req.params.name} silindi` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Process logları
router.get('/:name/logs', authenticateToken, async (req, res) => {
  const lines = parseInt(req.query.lines) || 100;
  try {
    const logs = await getProcessLogs(req.params.name, lines);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
