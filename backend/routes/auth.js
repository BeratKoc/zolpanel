const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db, addLog } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!JWT_SECRET) {
  console.error('HATA: JWT_SECRET env değişkeni tanımlanmamış! Lütfen .env dosyasını kontrol edin.');
  process.exit(1);
}

// Brute force koruması: 5 başarısız deneme → 15 dakika ban
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    addLog('system', 'warn', `Brute force girişimi engellendi: ${req.ip}`);
    res.status(429).json({
      error: 'Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.'
    });
  }
});

// Login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }

  db.users.findOne({ username }, async (err, user) => {
    if (err || !user) {
      addLog('system', 'warn', `Başarısız giriş denemesi: "${username}" - IP: ${req.ip}`);
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      addLog('system', 'warn', `Başarısız giriş denemesi: "${username}" - IP: ${req.ip}`);
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    addLog('system', 'info', `Başarılı giriş: "${username}" - IP: ${req.ip}`);
    res.json({ token, username: user.username });
  });
});

// Şifre değiştir
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' });
  }

  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'Şifre en az 12 karakter olmalı' });
  }

  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'Şifre en az bir büyük harf ve bir rakam içermeli' });
  }

  db.users.findOne({ username: req.user.username }, async (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Mevcut şifre yanlış' });

    const hash = await bcrypt.hash(newPassword, 10);
    db.users.update({ _id: user._id }, { $set: { password: hash } }, {}, (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Şifre güncellenemedi' });
      addLog('system', 'info', `Şifre değiştirildi: "${user.username}"`);
      res.json({ message: 'Şifre başarıyla güncellendi' });
    });
  });
});

// Token doğrulama middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token gerekli' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token' });
    req.user = user;
    next();
  });
}

// Token kontrol endpoint'i
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, username: req.user.username });
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
